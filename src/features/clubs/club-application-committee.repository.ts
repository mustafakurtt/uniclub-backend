import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { clubApplicationCommitteeVotes, users } from "../../db/schema";
import { approvalCommitteesRepository } from "../approval-committees/approval-committees.repository";
import { adminRepository } from "../admin/admin.repository";
import { badRequest, forbidden, notFound } from "../../shared/utils/errors";
import {
  computeCommitteeMajorityThreshold,
  findCurrentApprovalStep,
  isCommitteeMajorityStep,
  type ApplicationApprovalRow,
} from "./club-application-chain.core";

export type ApplicationWithApprovals = {
  id: string;
  universityId: string;
  applicantId: string;
  proposedName: string;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "revision_requested";
  approvals: Array<{
    id: string;
    step: number;
    approverRole: string | null;
    stepKind: "role_sequential" | "committee_majority";
    committeeId: string | null;
    status: ApplicationApprovalRow["status"];
  }>;
};

export type CommitteeVoteRow = Awaited<
  ReturnType<typeof clubApplicationCommitteeRepository.findVotesForStep>
>[number];

function toApprovalRows(approvals: ApplicationWithApprovals["approvals"]): ApplicationApprovalRow[] {
  return approvals.map((a) => ({
    step: a.step,
    approverRole: a.approverRole,
    stepKind: a.stepKind,
    committeeId: a.committeeId,
    status: a.status,
  }));
}

export const clubApplicationCommitteeRepository = {
  findApplicationWithApprovals(applicationId: string, universityId: string) {
    return db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
      with: { approvals: { orderBy: { step: "asc" } } },
    });
  },

  findVotesForStep(
    applicationId: string,
    approvalStep: number,
    committeeId: string,
    universityId: string
  ) {
    return db.query.clubApplicationCommitteeVotes.findMany({
      where: {
        applicationId,
        approvalStep,
        committeeId,
        universityId,
      },
      with: { voter: true },
      orderBy: { createdAt: "asc" },
    });
  },

  findUsersByIds(userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve([]);
    return db.select().from(users).where(inArray(users.id, userIds));
  },

  async castCommitteeVote(
    universityId: string,
    applicationId: string,
    voterUserId: string,
    vote: "approve" | "reject",
    trimmedReason: string | null
  ) {
    return db.transaction(async (tx) => {
      const application = await tx.query.clubApplications.findFirst({
        where: { id: applicationId, universityId },
        with: { approvals: { orderBy: { step: "asc" } } },
      });

      if (!application) {
        throw notFound("admin.applicationNotFound");
      }
      if (application.status !== "pending") {
        throw badRequest("admin.applicationAlreadyDecided");
      }

      const approvalRows = toApprovalRows(application.approvals);
      const current = findCurrentApprovalStep(approvalRows);
      if (!current || !isCommitteeMajorityStep(current) || !current.committeeId) {
        throw badRequest("admin.committeeStepNotActive");
      }

      const approvalRow = application.approvals.find((a) => a.step === current.step);
      if (!approvalRow) {
        throw badRequest("admin.applicationAlreadyDecided");
      }

      const committee = await approvalCommitteesRepository.findByIdInUniversity(
        universityId,
        current.committeeId
      );
      if (!committee) {
        throw notFound("approvalCommittee.notFound");
      }

      const isMember = await approvalCommitteesRepository.isActiveMember(
        current.committeeId,
        universityId,
        voterUserId
      );
      if (!isMember) {
        throw forbidden("admin.committeeVoteForbidden");
      }

      await tx
        .insert(clubApplicationCommitteeVotes)
        .values({
          applicationId,
          universityId,
          approvalStep: current.step,
          committeeId: current.committeeId,
          voterUserId,
          vote,
          reason: trimmedReason,
        })
        .onConflictDoUpdate({
          target: [
            clubApplicationCommitteeVotes.applicationId,
            clubApplicationCommitteeVotes.approvalStep,
            clubApplicationCommitteeVotes.voterUserId,
          ],
          set: {
            vote,
            reason: trimmedReason,
            updatedAt: new Date(),
          },
        });

      const votes = await tx.query.clubApplicationCommitteeVotes.findMany({
        where: {
          applicationId,
          approvalStep: current.step,
          committeeId: current.committeeId,
        },
      });

      const memberCount = await approvalCommitteesRepository.countActiveMembers(
        current.committeeId,
        universityId
      );
      const requiredApprovals = computeCommitteeMajorityThreshold(memberCount);
      const approveCount = votes.filter((v) => v.vote === "approve").length;
      const rejectCount = votes.filter((v) => v.vote === "reject").length;

      let stepDecision: "approved" | "rejected" | null = null;
      if (approveCount >= requiredApprovals) {
        stepDecision = "approved";
      } else if (rejectCount >= requiredApprovals) {
        stepDecision = "rejected";
      }

      const tallySnapshot = {
        memberCount,
        requiredApprovals,
        approveCount,
        rejectCount,
        votes: votes.length,
      };

      if (!stepDecision) {
        return {
          finalized: false as const,
          application,
          tally: tallySnapshot,
        };
      }

      const finalizeResult = await adminRepository.finalizeApplicationStepInTransaction(
        tx,
        universityId,
        applicationId,
        application,
        approvalRow.id,
        stepDecision,
        voterUserId,
        stepDecision === "rejected" ? trimmedReason : trimmedReason
      );

      return {
        finalized: true as const,
        decision: stepDecision,
        result: finalizeResult,
        tally: tallySnapshot,
      };
    });
  },
};
