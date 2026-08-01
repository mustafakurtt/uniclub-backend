import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../../db";
import { clubAdvisors, clubAdvisorInvitations } from "../../db/schema";

export const clubAdvisorsRepository = {
  findActiveAdvisor(clubId: string, userId: string) {
    return db.query.clubAdvisors.findFirst({
      where: { clubId, userId, leftAt: { isNull: true } },
    });
  },

  findActiveAdvisorsByClub(clubId: string) {
    return db.query.clubAdvisors.findMany({
      where: { clubId, leftAt: { isNull: true } },
      with: { user: true },
    });
  },

  countActiveAdvisors(clubId: string) {
    return db.query.clubAdvisors.findMany({
      where: { clubId, leftAt: { isNull: true } },
      columns: { clubId: true },
    });
  },

  findInvitationById(invitationId: string) {
    return db.query.clubAdvisorInvitations.findFirst({
      where: { id: invitationId },
      with: {
        club: true,
        invitee: true,
        inviter: true,
      },
    });
  },

  findPendingInvitation(clubId: string, inviteeUserId: string) {
    return db.query.clubAdvisorInvitations.findFirst({
      where: { clubId, inviteeUserId, status: "pending" },
    });
  },

  listPendingInvitationsByClub(clubId: string) {
    return db.query.clubAdvisorInvitations.findMany({
      where: { clubId, status: "pending" },
      with: { invitee: true, inviter: true },
      orderBy: { createdAt: "desc" },
    });
  },

  listPendingInvitationsForUser(inviteeUserId: string) {
    return db.query.clubAdvisorInvitations.findMany({
      where: { inviteeUserId, status: "pending" },
      with: { club: true, inviter: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async expireStalePending(now: Date) {
    await db
      .update(clubAdvisorInvitations)
      .set({ status: "expired", respondedAt: now, updatedAt: now })
      .where(and(eq(clubAdvisorInvitations.status, "pending"), lt(clubAdvisorInvitations.expiresAt, now)));
  },

  async createInvitation(params: {
    clubId: string;
    universityId: string;
    inviteeUserId: string;
    invitedBy: string;
    message: string | null;
    expiresAt: Date;
  }) {
    const [row] = await db
      .insert(clubAdvisorInvitations)
      .values({
        clubId: params.clubId,
        universityId: params.universityId,
        inviteeUserId: params.inviteeUserId,
        invitedBy: params.invitedBy,
        message: params.message,
        expiresAt: params.expiresAt,
        status: "pending",
      })
      .returning();
    return row;
  },

  async acceptInvitationInTx(invitationId: string, respondedAt: Date) {
    return db.transaction(async (tx) => {
      const invitation = await tx.query.clubAdvisorInvitations.findFirst({
        where: { id: invitationId },
      });
      if (!invitation || invitation.status !== "pending") return null;

      await tx
        .update(clubAdvisorInvitations)
        .set({
          status: "accepted",
          respondedAt,
          updatedAt: respondedAt,
        })
        .where(eq(clubAdvisorInvitations.id, invitationId));

      const existing = await tx.query.clubAdvisors.findFirst({
        where: { clubId: invitation.clubId, userId: invitation.inviteeUserId },
      });

      if (existing) {
        await tx
          .update(clubAdvisors)
          .set({ leftAt: null, leaveReason: null, updatedAt: respondedAt })
          .where(
            and(eq(clubAdvisors.clubId, invitation.clubId), eq(clubAdvisors.userId, invitation.inviteeUserId))
          );
      } else {
        await tx.insert(clubAdvisors).values({
          clubId: invitation.clubId,
          userId: invitation.inviteeUserId,
          universityId: invitation.universityId,
        });
      }

      return invitation;
    });
  },

  async declineInvitation(invitationId: string, declineReason: string, respondedAt: Date) {
    const [row] = await db
      .update(clubAdvisorInvitations)
      .set({
        status: "declined",
        declineReason,
        respondedAt,
        updatedAt: respondedAt,
      })
      .where(and(eq(clubAdvisorInvitations.id, invitationId), eq(clubAdvisorInvitations.status, "pending")))
      .returning();
    return row ?? null;
  },

  async cancelInvitation(invitationId: string, cancelledAt: Date) {
    const [row] = await db
      .update(clubAdvisorInvitations)
      .set({
        status: "cancelled",
        respondedAt: cancelledAt,
        updatedAt: cancelledAt,
      })
      .where(and(eq(clubAdvisorInvitations.id, invitationId), eq(clubAdvisorInvitations.status, "pending")))
      .returning();
    return row ?? null;
  },

  async markInvitationExpired(invitationId: string, at: Date) {
    const [row] = await db
      .update(clubAdvisorInvitations)
      .set({ status: "expired", respondedAt: at, updatedAt: at })
      .where(and(eq(clubAdvisorInvitations.id, invitationId), eq(clubAdvisorInvitations.status, "pending")))
      .returning();
    return row ?? null;
  },

  async findLatestInvitationForPair(clubId: string, inviteeUserId: string) {
    return db.query.clubAdvisorInvitations.findFirst({
      where: { clubId, inviteeUserId },
      orderBy: { createdAt: "desc" },
    });
  },

  async withdrawAdvisor(clubId: string, userId: string, reason: string, leftAt: Date) {
    const [row] = await db
      .update(clubAdvisors)
      .set({ leftAt, leaveReason: reason, updatedAt: leftAt })
      .where(
        and(eq(clubAdvisors.clubId, clubId), eq(clubAdvisors.userId, userId), isNull(clubAdvisors.leftAt))
      )
      .returning();
    return row ?? null;
  },

  async removeAdvisor(clubId: string, userId: string) {
    await db.delete(clubAdvisors).where(and(eq(clubAdvisors.clubId, clubId), eq(clubAdvisors.userId, userId)));
  },
};
