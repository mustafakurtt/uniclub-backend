import { db } from "../../db";
import {
  findCurrentApprovalStep,
  isCommitteeMajorityStep,
  type ApplicationApprovalRow,
} from "../clubs/club-application-chain.core";
import { approvalCommitteesRepository } from "./approval-committees.repository";

function mapApprovalRows(
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

export const committeeApplicationAccessRepository = {
  /**
   * Başvurunun mevcut kademesi kurul oylamasındaysa ve kullanıcı o kurulun üyesiyse erişim ver.
   */
  async resolveStepAccess(
    universityId: string,
    applicationId: string,
    userId: string
  ): Promise<{ committeeId: string; approvalStep: number } | null> {
    const application = await db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
      with: { approvals: { orderBy: { step: "asc" } } },
    });
    if (!application || application.status !== "pending") {
      return null;
    }

    const current = findCurrentApprovalStep(mapApprovalRows(application.approvals));
    if (!current || !isCommitteeMajorityStep(current) || !current.committeeId) {
      return null;
    }

    const isMember = await approvalCommitteesRepository.isActiveMember(
      current.committeeId,
      universityId,
      userId
    );
    if (!isMember) {
      return null;
    }

    return { committeeId: current.committeeId, approvalStep: current.step };
  },

  /** Üyenin oy vermediği, kurul kademesinde bekleyen başvurular. */
  async listPendingApplicationsAwaitingUserVote(universityId: string, userId: string) {
    const memberRows = await db.query.approvalCommitteeMembers.findMany({
      where: { universityId, userId },
      columns: { committeeId: true },
    });
    if (memberRows.length === 0) {
      return [];
    }

    const activeCommittees = await db.query.approvalCommittees.findMany({
      where: { universityId, isActive: true },
      columns: { id: true, name: true },
    });
    const activeById = new Map(activeCommittees.map((c) => [c.id, c]));
    const userCommitteeIds = memberRows
      .map((r) => r.committeeId)
      .filter((id) => activeById.has(id));
    if (userCommitteeIds.length === 0) {
      return [];
    }

    const pendingApps = await db.query.clubApplications.findMany({
      where: { universityId, status: "pending" },
      with: {
        approvals: { orderBy: { step: "asc" } },
        applicant: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const results: Array<{
      application: typeof pendingApps[number];
      currentStep: number;
      committeeId: string;
      committeeName: string;
    }> = [];

    for (const app of pendingApps) {
      const current = findCurrentApprovalStep(mapApprovalRows(app.approvals));
      if (!current || !isCommitteeMajorityStep(current) || !current.committeeId) {
        continue;
      }
      if (!userCommitteeIds.includes(current.committeeId)) {
        continue;
      }

      const voted = await db.query.clubApplicationCommitteeVotes.findFirst({
        where: {
          applicationId: app.id,
          universityId,
          approvalStep: current.step,
          committeeId: current.committeeId,
          voterUserId: userId,
        },
        columns: { id: true },
      });
      if (voted) {
        continue;
      }

      const committee = activeById.get(current.committeeId);
      results.push({
        application: app,
        currentStep: current.step,
        committeeId: current.committeeId,
        committeeName: committee?.name ?? "—",
      });
    }

    return results;
  },
};
