import type { AcceptTenantAdminInvitationDTO } from "./auth.schema";
import type { DbExecutor } from "../../db/executor";
import type { WithAfterCommit } from "../../shared/types/after-commit";
import { authRepository } from "./auth.repository";
import { tenantAdminInvitationsRepository } from "./tenant-admin-invitations.repository";
import { toTenantAdminInvitationPublic, type TenantAdminInvitationPublic } from "./tenant-admin-invitations.types";
import { generateOneTimeToken, hashToken } from "../../core/auth/token";
import { emailQueue } from "./auth.queue";
import { resolveBackgroundLocaleForTenant } from "../../shared/i18n/background-locale";
import { invalidateUserPermissions } from "../../shared/rbac/rbac.cache";
import { hashPassword } from "../../shared/utils/password.util";
import { badRequest, notFound } from "../../shared/utils/errors";
import { assertTenantAcceptsNewUsers } from "./auth-tenant-gate";
import { runAuthTransactionWithAfterCommit } from "./auth-transaction.util";

const TENANT_ADMIN_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function queueTenantAdminInvitationEmail(
  email: string,
  firstName: string,
  token: string,
  universityId: string
) {
  const locale = await resolveBackgroundLocaleForTenant(universityId);
  await emailQueue.add("send-tenant-admin-invitation", {
    email,
    firstName,
    token,
    locale,
  });
}

function namesMatchInvitation(
  invitation: { firstName: string; lastName: string },
  firstName: string,
  lastName: string
): boolean {
  const norm = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
  return norm(invitation.firstName) === norm(firstName) && norm(invitation.lastName) === norm(lastName);
}

function assertInvitationAcceptable(invitation: {
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
}) {
  if (invitation.acceptedAt) {
    throw badRequest("auth.invitationAlreadyUsed");
  }
  if (invitation.cancelledAt) {
    throw badRequest("auth.invitationCancelled");
  }
  if (invitation.expiresAt < new Date()) {
    throw badRequest("auth.invitationExpired");
  }
}

export const authTenantAdminInvitationService = {
  /**
   * Tenant yöneticisi daveti — tx içinde yalnızca DB yazımı; mail commit sonrası.
   */
  async createTenantAdminInvitationInTx(params: {
    tx: DbExecutor;
    universityId: string;
    email: string;
    firstName: string;
    lastName: string;
    roleName: string;
    invitedBy: string | null;
  }): Promise<WithAfterCommit<TenantAdminInvitationPublic>> {
    const existingUser = await authRepository.findUserByEmailInTx(params.tx, params.email);
    if (existingUser) {
      throw badRequest("auth.emailAlreadyInUse");
    }

    const pending = await tenantAdminInvitationsRepository.findPendingByUniversityAndEmailInTx(
      params.tx,
      params.universityId,
      params.email
    );
    if (pending) {
      throw badRequest("auth.invitationPendingExists");
    }

    const token = generateOneTimeToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + TENANT_ADMIN_INVITATION_TTL_MS);

    const row = await tenantAdminInvitationsRepository.createInTx(params.tx, {
      universityId: params.universityId,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      roleName: params.roleName,
      tokenHash,
      invitedBy: params.invitedBy,
      expiresAt,
    });

    const publicInvitation = toTenantAdminInvitationPublic(row);
    return {
      result: publicInvitation,
      afterCommit: async () => {
        await queueTenantAdminInvitationEmail(params.email, params.firstName, token, params.universityId);
      },
    };
  },

  async createTenantAdminInvitation(params: {
    universityId: string;
    email: string;
    firstName: string;
    lastName: string;
    roleName: string;
    invitedBy: string | null;
  }): Promise<TenantAdminInvitationPublic> {
    return await runAuthTransactionWithAfterCommit((tx) =>
      authTenantAdminInvitationService.createTenantAdminInvitationInTx({ tx, ...params })
    );
  },

  async listPendingTenantAdminInvitations(universityId: string): Promise<TenantAdminInvitationPublic[]> {
    const rows = await tenantAdminInvitationsRepository.listPendingByUniversity(universityId);
    return rows.map(toTenantAdminInvitationPublic);
  },

  async cancelTenantAdminInvitation(universityId: string, invitationId: string): Promise<TenantAdminInvitationPublic> {
    const invitation = await tenantAdminInvitationsRepository.findByIdInUniversity(invitationId, universityId);
    if (!invitation) {
      throw notFound("auth.invitationNotFound");
    }
    if (invitation.acceptedAt || invitation.cancelledAt || invitation.expiresAt < new Date()) {
      throw badRequest("auth.invitationNotPending");
    }
    const cancelled = await tenantAdminInvitationsRepository.markCancelled(invitationId);
    if (!cancelled) {
      throw badRequest("auth.invitationNotPending");
    }
    return toTenantAdminInvitationPublic(cancelled);
  },

  /**
   * Public davet kabul — tenant ve rol token'dan okunur; şifre tx öncesi hash'lenir.
   */
  async acceptTenantAdminInvitation(data: AcceptTenantAdminInvitationDTO) {
    const tokenHash = await hashToken(data.token);
    const invitation = await tenantAdminInvitationsRepository.findByTokenHash(tokenHash);
    if (!invitation) {
      throw badRequest("auth.invalidInvitationLink");
    }

    assertInvitationAcceptable(invitation);
    await assertTenantAcceptsNewUsers(invitation.universityId);

    if (!namesMatchInvitation(invitation, data.firstName, data.lastName)) {
      throw badRequest("auth.invitationNameMismatch");
    }

    const passwordHash = await hashPassword(data.password);

    const user = await authRepository.runInTransaction(async (tx) => {
      const existing = await authRepository.findUserByEmailInTx(tx, invitation.email);
      if (existing) {
        throw badRequest("auth.emailAlreadyInUse");
      }

      const marked = await tenantAdminInvitationsRepository.markAcceptedInTx(tx, invitation.id);
      if (!marked) {
        throw badRequest("auth.invitationAlreadyUsed");
      }

      return await authRepository.provisionUserWithRoleInTx(
        tx,
        {
          universityId: invitation.universityId,
          email: invitation.email,
          passwordHash,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          studentNumber: null,
          status: "active",
          mustChangePassword: false,
        },
        invitation.roleName
      );
    });

    await invalidateUserPermissions(user.id);

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  },
};
