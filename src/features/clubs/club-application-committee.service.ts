import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { approvalCommitteesRepository } from "../approval-committees/approval-committees.repository";
import { adminRepository } from "../admin/admin.repository";
import { auditService } from "../audit/audit.service";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { badRequest, forbidden, notFound } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import {
  computeCommitteeMajorityThreshold,
  findCurrentApprovalStep,
  isCommitteeMajorityStep,
  type ApplicationApprovalRow,
} from "./club-application-chain.core";

export type CommitteeTallySummary = {
  committeeId: string;
  committeeName: string;
  memberCount: number;
  /** Salt çoğunluk eşiği: floor(n/2)+1 */
  requiredApprovals: number;
  approveCount: number;
  rejectCount: number;
  notVotedCount: number;
};

export type CommitteeVoteRecord = {
  voterUserId: string;
  voter: ReturnType<typeof toSafeUser> | null;
  vote: "approve" | "reject";
  reason: string | null;
  votedAt: Date;
};

export type CommitteeTallyFull = CommitteeTallySummary & {
  votes: CommitteeVoteRecord[];
  myVote: CommitteeVoteRecord | null;
};

export type CommitteeVoteInput = {
  vote: "approve" | "reject";
  reason?: string;
};

function toApprovalRows(
  approvals: Array<{
    step: number;
    approverRole: string | null;
    stepKind: "role_sequential" | "committee_majority";
    committeeId: string | null;
    status: ApplicationApprovalRow["status"];
  }>
): ApplicationApprovalRow[] {
  return approvals.map((a) => ({
    step: a.step,
    approverRole: a.approverRole,
    stepKind: a.stepKind,
    committeeId: a.committeeId,
    status: a.status,
  }));
}

async function notifyCommitteeMembers(
  universityId: string,
  applicationId: string,
  proposedName: string,
  committeeId: string,
  step: number
) {
  const memberIds = await approvalCommitteesRepository.listMemberUserIds(committeeId, universityId);
  for (const userId of memberIds) {
    await notificationsService.notifySafe(userId, {
      type: NotificationType.CLUB_APPLICATION_COMMITTEE_PENDING,
      title: "Kulüp başvurusu kurul oylamasında",
      body: `'${proposedName}' başvurusu kurul onayınızı bekliyor.`,
      data: { applicationId, committeeId, step },
    });
  }
}

export const clubApplicationCommitteeService = {
  async notifyIfCurrentStepIsCommittee(universityId: string, applicationId: string) {
    const application = await db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
      with: { approvals: { orderBy: { step: "asc" } } },
    });
    if (!application || application.status !== "pending") return;

    const rows = toApprovalRows(application.approvals);
    const current = findCurrentApprovalStep(rows);
    if (!current || !isCommitteeMajorityStep(current) || !current.committeeId) return;

    await notifyCommitteeMembers(
      universityId,
      applicationId,
      application.proposedName,
      current.committeeId,
      current.step
    );
  },

  async assertCommitteeMemberForRevision(
    actorUserId: string,
    universityId: string,
    committeeId: string
  ): Promise<void> {
    const isMember = await approvalCommitteesRepository.isActiveMember(
      committeeId,
      universityId,
      actorUserId
    );
    if (!isMember) {
      throw forbidden("admin.approvalStepForbidden");
    }
  },

  async getCommitteeTally(
    universityId: string,
    applicationId: string,
    approvalStep: number,
    committeeId: string,
    viewerUserId: string | null,
    includeIndividualVotes: boolean
  ): Promise<CommitteeTallySummary | CommitteeTallyFull | null> {
    const committee = await approvalCommitteesRepository.findByIdInUniversity(
      universityId,
      committeeId
    );
    if (!committee) return null;

    const memberCount = await approvalCommitteesRepository.countActiveMembers(
      committeeId,
      universityId
    );
    const requiredApprovals = computeCommitteeMajorityThreshold(memberCount);

    const voteRows = await db.query.clubApplicationCommitteeVotes.findMany({
      where: {
        applicationId,
        approvalStep,
        committeeId,
        universityId,
      },
      with: { voter: true },
      orderBy: { createdAt: "asc" },
    });

    const approveCount = voteRows.filter((v) => v.vote === "approve").length;
    const rejectCount = voteRows.filter((v) => v.vote === "reject").length;
    const notVotedCount = Math.max(0, memberCount - voteRows.length);

    const summary: CommitteeTallySummary = {
      committeeId,
      committeeName: committee.name,
      memberCount,
      requiredApprovals,
      approveCount,
      rejectCount,
      notVotedCount,
    };

    if (!includeIndividualVotes) {
      return summary;
    }

    const mapVote = (row: typeof voteRows[number]): CommitteeVoteRecord => ({
      voterUserId: row.voterUserId,
      voter: row.voter ? toSafeUser(row.voter) : null,
      vote: row.vote,
      reason: row.reason,
      votedAt: row.updatedAt ?? row.createdAt,
    });

    const myVoteRow = viewerUserId
      ? voteRows.find((v) => v.voterUserId === viewerUserId)
      : undefined;

    return {
      ...summary,
      votes: voteRows.map(mapVote),
      myVote: myVoteRow ? mapVote(myVoteRow) : null,
    };
  },

  async enrichApprovalsWithCommitteeTally<T extends {
    step: number;
    stepKind: "role_sequential" | "committee_majority";
    committeeId: string | null;
  }>(
    universityId: string,
    applicationId: string,
    approvals: T[],
    viewerUserId: string | null,
    studentView: boolean
  ) {
    return Promise.all(
      approvals.map(async (approval) => {
        if (approval.stepKind !== "committee_majority" || !approval.committeeId) {
          return { ...approval, committeeTally: null };
        }
        const committeeTally = await this.getCommitteeTally(
          universityId,
          applicationId,
          approval.step,
          approval.committeeId,
          viewerUserId,
          !studentView
        );
        return { ...approval, committeeTally };
      })
    );
  },

  async castVote(
    universityId: string,
    applicationId: string,
    voterUserId: string,
    input: CommitteeVoteInput
  ) {
    if (input.vote === "reject" && !input.reason?.trim()) {
      throw badRequest("admin.committeeRejectReasonRequired");
    }

    const result = await db.transaction(async (tx) => {
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

      const trimmedReason = input.reason?.trim() ?? null;

      await tx
        .insert(schema.clubApplicationCommitteeVotes)
        .values({
          applicationId,
          universityId,
          approvalStep: current.step,
          committeeId: current.committeeId,
          voterUserId,
          vote: input.vote,
          reason: trimmedReason,
        })
        .onConflictDoUpdate({
          target: [
            schema.clubApplicationCommitteeVotes.applicationId,
            schema.clubApplicationCommitteeVotes.approvalStep,
            schema.clubApplicationCommitteeVotes.voterUserId,
          ],
          set: {
            vote: input.vote,
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
      const threshold = computeCommitteeMajorityThreshold(memberCount);
      const approveCount = votes.filter((v) => v.vote === "approve").length;
      const rejectCount = votes.filter((v) => v.vote === "reject").length;

      let stepDecision: "approved" | "rejected" | null = null;
      if (approveCount >= threshold) {
        stepDecision = "approved";
      } else if (rejectCount >= threshold) {
        stepDecision = "rejected";
      }

      if (!stepDecision) {
        return {
          finalized: false as const,
          application,
          tally: { memberCount, threshold, approveCount, rejectCount, votes: votes.length },
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
        tally: { memberCount, threshold, approveCount, rejectCount, votes: votes.length },
      };
    });

    await auditService.record({
      universityId,
      actorId: voterUserId,
      action: `club.application.committee_vote.${input.vote}`,
      method: "PATCH",
      path: `/api/admin/universities/${universityId}/club-applications/${applicationId}/committee-vote`,
      status: 200,
      targetType: "club_application",
      targetId: applicationId,
      metadata: {
        vote: input.vote,
        reason: input.reason?.trim() ?? null,
        tally: result.tally,
        finalized: result.finalized,
        decision: result.finalized ? result.decision : null,
      },
    });

    if (result.finalized && result.decision === "approved" && result.result.application.status === "pending") {
      await this.notifyIfCurrentStepIsCommittee(universityId, applicationId);
    }

    return result;
  },
};
