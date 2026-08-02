import { approvalCommitteesRepository } from "../approval-committees/approval-committees.repository";
import { adminRepository } from "../admin/admin.repository";
import { auditService } from "../audit/audit.service";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { badRequest, forbidden } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import {
  computeCommitteeMajorityThreshold,
  findCurrentApprovalStep,
  isCommitteeMajorityStep,
  type ApplicationApprovalRow,
} from "./club-application-chain.core";
import { clubApplicationCommitteeRepository } from "./club-application-committee.repository";

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
  notVotedMembers: ReturnType<typeof toSafeUser>[];
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
    const application = await clubApplicationCommitteeRepository.findApplicationWithApprovals(
      applicationId,
      universityId
    );
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

    const voteRows = await clubApplicationCommitteeRepository.findVotesForStep(
      applicationId,
      approvalStep,
      committeeId,
      universityId
    );

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

    const memberUserIds = await approvalCommitteesRepository.listMemberUserIds(
      committeeId,
      universityId
    );
    const votedIds = new Set(voteRows.map((v) => v.voterUserId));
    const notVotedUserIds = memberUserIds.filter((id) => !votedIds.has(id)).sort();
    const notVotedUsers = await clubApplicationCommitteeRepository.findUsersByIds(notVotedUserIds);
    const notVotedById = new Map(notVotedUsers.map((u) => [u.id, u]));
    const notVotedMembers = notVotedUserIds
      .map((id) => notVotedById.get(id))
      .filter((u): u is NonNullable<typeof u> => u != null)
      .map((u) => toSafeUser(u));

    return {
      ...summary,
      votes: voteRows.map(mapVote),
      myVote: myVoteRow ? mapVote(myVoteRow) : null,
      notVotedMembers,
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

    const trimmedReason = input.reason?.trim() ?? null;
    const result = await clubApplicationCommitteeRepository.castCommitteeVote(
      universityId,
      applicationId,
      voterUserId,
      input.vote,
      trimmedReason
    );

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
        reason: trimmedReason,
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
