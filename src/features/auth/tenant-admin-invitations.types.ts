import type { InferSelectModel } from "drizzle-orm";
import type { tenantAdminInvitations } from "../../db/schema";

export type TenantAdminInvitationRow = InferSelectModel<typeof tenantAdminInvitations>;

export type TenantAdminInvitationStatus = "pending" | "accepted" | "cancelled" | "expired";

export type TenantAdminInvitationPublic = {
  id: string;
  universityId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
  status: TenantAdminInvitationStatus;
  expiresAt: Date;
  invitedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function deriveTenantAdminInvitationStatus(
  row: Pick<TenantAdminInvitationRow, "acceptedAt" | "cancelledAt" | "expiresAt">
): TenantAdminInvitationStatus {
  if (row.acceptedAt) return "accepted";
  if (row.cancelledAt) return "cancelled";
  if (row.expiresAt < new Date()) return "expired";
  return "pending";
}

export function toTenantAdminInvitationPublic(row: TenantAdminInvitationRow): TenantAdminInvitationPublic {
  return {
    id: row.id,
    universityId: row.universityId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    roleName: row.roleName,
    status: deriveTenantAdminInvitationStatus(row),
    expiresAt: row.expiresAt,
    invitedBy: row.invitedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
