import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import type { DbExecutor } from "../../db/executor";

export type CreateTenantAdminInvitationPayload = {
  universityId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
  tokenHash: string;
  invitedBy: string | null;
  expiresAt: Date;
};

export const tenantAdminInvitationsRepository = {
  async createInTx(tx: DbExecutor, data: CreateTenantAdminInvitationPayload) {
    const [row] = await tx
      .insert(schema.tenantAdminInvitations)
      .values({
        universityId: data.universityId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        roleName: data.roleName,
        tokenHash: data.tokenHash,
        invitedBy: data.invitedBy,
        expiresAt: data.expiresAt,
      })
      .returning();
    return row;
  },

  async findByTokenHash(tokenHash: string) {
    return await db.query.tenantAdminInvitations.findFirst({
      where: { tokenHash },
    });
  },

  async findPendingByUniversityAndEmail(universityId: string, email: string) {
    return await db.query.tenantAdminInvitations.findFirst({
      where: {
        universityId,
        email,
        acceptedAt: { isNull: true },
        cancelledAt: { isNull: true },
        expiresAt: { gt: new Date() },
      },
    });
  },

  async findPendingByUniversityAndEmailInTx(tx: DbExecutor, universityId: string, email: string) {
    return await tx.query.tenantAdminInvitations.findFirst({
      where: {
        universityId,
        email,
        acceptedAt: { isNull: true },
        cancelledAt: { isNull: true },
        expiresAt: { gt: new Date() },
      },
    });
  },

  async listPendingByUniversity(universityId: string) {
    return await db.query.tenantAdminInvitations.findMany({
      where: {
        universityId,
        acceptedAt: { isNull: true },
        cancelledAt: { isNull: true },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findByIdInUniversity(invitationId: string, universityId: string) {
    return await db.query.tenantAdminInvitations.findFirst({
      where: { id: invitationId, universityId },
    });
  },

  async markAcceptedInTx(tx: DbExecutor, invitationId: string) {
    await tx
      .update(schema.tenantAdminInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.tenantAdminInvitations.id, invitationId));
  },

  async markCancelled(invitationId: string) {
    const [row] = await db
      .update(schema.tenantAdminInvitations)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(schema.tenantAdminInvitations.id, invitationId),
          isNull(schema.tenantAdminInvitations.acceptedAt),
          isNull(schema.tenantAdminInvitations.cancelledAt)
        )
      )
      .returning();
    return row;
  },
};
