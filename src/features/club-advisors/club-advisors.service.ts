import { auditService } from "../audit/audit.service";
import { clubsRepository } from "../clubs/clubs.repository";
import { clubEffects } from "../clubs/clubs.cache";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { badRequest, notFound } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import { clubAdvisorsRepository } from "./club-advisors.repository";
import type { DeclineAdvisorInvitationDTO, InviteAdvisorDTO, WithdrawAdvisorDTO } from "./club-advisors.schema";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isExpired(invitation: { expiresAt: Date; status: string }, now = new Date()) {
  return invitation.status === "pending" && invitation.expiresAt < now;
}

function toInvitationDto(
  row: Awaited<ReturnType<typeof clubAdvisorsRepository.findInvitationById>>
) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    declineReason: row.declineReason,
    expiresAt: row.expiresAt,
    respondedAt: row.respondedAt,
    createdAt: row.createdAt,
    club: row.club ? { id: row.club.id, name: row.club.name, slug: row.club.slug } : null,
    invitee: row.invitee ? toSafeUser(row.invitee) : null,
    inviter: row.inviter ? toSafeUser(row.inviter) : null,
  };
}

async function notifyInvitee(inviteeUserId: string, clubName: string, clubId: string, invitationId: string) {
  await notificationsService.notifySafe(inviteeUserId, {
    type: NotificationType.CLUB_ADVISOR_INVITED,
    title: "Kulüp danışmanlığı daveti",
    body: `${clubName} kulübü sizi danışman olarak davet etti.`,
    data: { clubId, invitationId },
  });
}

async function notifyInviter(
  inviterId: string | null,
  clubName: string,
  clubId: string,
  decision: "accepted" | "declined" | "withdrawn"
) {
  if (!inviterId) return;
  const body =
    decision === "accepted"
      ? `${clubName} kulübü danışman davetiniz kabul edildi.`
      : decision === "declined"
        ? `${clubName} kulübü danışman davetiniz reddedildi.`
        : `${clubName} kulübü danışmanı görevden çekildi.`;
  await notificationsService.notifySafe(inviterId, {
    type: NotificationType.CLUB_ADVISOR_RESPONDED,
    title: "Danışman daveti yanıtı",
    body,
    data: { clubId, decision },
  });
}

export const clubAdvisorsService = {
  async inviteAdvisor(
    universityId: string,
    clubId: string,
    invitedBy: string,
    target: InviteAdvisorDTO,
    isEligible: (userId: string) => Promise<boolean>
  ) {
    await clubAdvisorsRepository.expireStalePending(new Date());

    const active = await clubAdvisorsRepository.findActiveAdvisor(clubId, target.userId);
    if (active) {
      throw badRequest("clubAdvisor.alreadyAdvisor");
    }

    const pending = await clubAdvisorsRepository.findPendingInvitation(clubId, target.userId);
    if (pending) {
      throw badRequest("clubAdvisor.pendingInvitationExists");
    }

    if (!(await isEligible(target.userId))) {
      throw badRequest("clubAdvisor.notEligible");
    }

    const settings = await getTenantSettings(universityId);
    const expiresAt = addDays(new Date(), settings.clubAdvisorInvitationExpiryDays);
    const message = target.message?.trim() || null;

    const invitation = await clubAdvisorsRepository.createInvitation({
      clubId,
      universityId,
      inviteeUserId: target.userId,
      invitedBy,
      message,
      expiresAt,
    });

    await auditService.record({
      universityId,
      actorId: invitedBy,
      action: "club.advisor.invited",
      method: "POST",
      path: `/api/admin/universities/${universityId}/clubs/${clubId}/advisor-invitations`,
      status: 201,
      targetType: "club",
      targetId: clubId,
      metadata: { invitationId: invitation.id, inviteeUserId: target.userId },
    });

    const club = await clubAdvisorsRepository.findInvitationById(invitation.id);
    if (club?.club) {
      await notifyInvitee(target.userId, club.club.name, clubId, invitation.id);
    }

    return toInvitationDto(club);
  },

  async listClubInvitations(universityId: string, clubId: string) {
    await clubAdvisorsRepository.expireStalePending(new Date());
    const rows = await clubAdvisorsRepository.listPendingInvitationsByClub(clubId);
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      message: row.message,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      invitee: row.invitee ? toSafeUser(row.invitee) : null,
      inviter: row.inviter ? toSafeUser(row.inviter) : null,
    }));
  },

  async cancelInvitation(universityId: string, clubId: string, invitationId: string, actorId: string) {
    await clubAdvisorsRepository.expireStalePending(new Date());
    const invitation = await clubAdvisorsRepository.findInvitationById(invitationId);
    if (!invitation || invitation.clubId !== clubId || invitation.universityId !== universityId) {
      throw notFound("clubAdvisor.invitationNotFound");
    }
    if (invitation.status !== "pending") {
      throw badRequest("clubAdvisor.invitationNotPending");
    }
    if (isExpired(invitation)) {
      await clubAdvisorsRepository.markInvitationExpired(invitationId, new Date());
      throw badRequest("clubAdvisor.invitationExpired");
    }

    const cancelled = await clubAdvisorsRepository.cancelInvitation(invitationId, new Date());
    if (!cancelled) {
      throw badRequest("clubAdvisor.invitationNotPending");
    }

    await auditService.record({
      universityId,
      actorId,
      action: "club.advisor.invitation.cancelled",
      method: "DELETE",
      path: `/api/admin/universities/${universityId}/clubs/${clubId}/advisor-invitations/${invitationId}`,
      status: 200,
      targetType: "club",
      targetId: clubId,
      metadata: { invitationId },
    });

    return { id: invitationId };
  },

  async listMyInvitations(inviteeUserId: string) {
    await clubAdvisorsRepository.expireStalePending(new Date());
    const rows = await clubAdvisorsRepository.listPendingInvitationsForUser(inviteeUserId);
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      message: row.message,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      club: row.club ? { id: row.club.id, name: row.club.name, slug: row.club.slug } : null,
      inviter: row.inviter ? toSafeUser(row.inviter) : null,
    }));
  },

  async acceptInvitation(inviteeUserId: string, invitationId: string) {
    await clubAdvisorsRepository.expireStalePending(new Date());
    const invitation = await clubAdvisorsRepository.findInvitationById(invitationId);
    if (!invitation || invitation.inviteeUserId !== inviteeUserId) {
      throw notFound("clubAdvisor.invitationNotFound");
    }
    if (invitation.status !== "pending") {
      throw badRequest("clubAdvisor.invitationNotPending");
    }
    if (isExpired(invitation)) {
      await clubAdvisorsRepository.markInvitationExpired(invitationId, new Date());
      throw badRequest("clubAdvisor.invitationExpired");
    }

    const now = new Date();
    const accepted = await clubAdvisorsRepository.acceptInvitationInTx(invitationId, now);
    if (!accepted) {
      throw badRequest("clubAdvisor.invitationNotPending");
    }

    await auditService.record({
      universityId: invitation.universityId,
      actorId: inviteeUserId,
      action: "club.advisor.invitation.accepted",
      method: "PATCH",
      path: `/api/users/me/advisor-invitations/${invitationId}/accept`,
      status: 200,
      targetType: "club",
      targetId: invitation.clubId,
      metadata: { invitationId },
    });

    if (invitation.club) {
      await notifyInviter(invitation.invitedBy, invitation.club.name, invitation.clubId, "accepted");
    }

    await clubEffects.detailChanged.emit(invitation.clubId);

    return { clubId: invitation.clubId, invitationId };
  },

  async declineInvitation(inviteeUserId: string, invitationId: string, body: DeclineAdvisorInvitationDTO) {
    await clubAdvisorsRepository.expireStalePending(new Date());
    const invitation = await clubAdvisorsRepository.findInvitationById(invitationId);
    if (!invitation || invitation.inviteeUserId !== inviteeUserId) {
      throw notFound("clubAdvisor.invitationNotFound");
    }
    if (invitation.status !== "pending") {
      throw badRequest("clubAdvisor.invitationNotPending");
    }
    if (isExpired(invitation)) {
      await clubAdvisorsRepository.markInvitationExpired(invitationId, new Date());
      throw badRequest("clubAdvisor.invitationExpired");
    }

    const reason = body.reason.trim();
    const declined = await clubAdvisorsRepository.declineInvitation(invitationId, reason, new Date());
    if (!declined) {
      throw badRequest("clubAdvisor.invitationNotPending");
    }

    await auditService.record({
      universityId: invitation.universityId,
      actorId: inviteeUserId,
      action: "club.advisor.invitation.declined",
      method: "PATCH",
      path: `/api/users/me/advisor-invitations/${invitationId}/decline`,
      status: 200,
      targetType: "club",
      targetId: invitation.clubId,
      metadata: { invitationId, reason },
    });

    if (invitation.club) {
      await notifyInviter(invitation.invitedBy, invitation.club.name, invitation.clubId, "declined");
    }

    return { invitationId };
  },

  async withdrawFromClub(advisorUserId: string, clubId: string, body: WithdrawAdvisorDTO) {
    const active = await clubAdvisorsRepository.findActiveAdvisor(clubId, advisorUserId);
    if (!active) {
      throw badRequest("clubAdvisor.notAdvisor");
    }

    const reason = body.reason.trim();
    const now = new Date();
    const withdrawn = await clubAdvisorsRepository.withdrawAdvisor(clubId, advisorUserId, reason, now);
    if (!withdrawn) {
      throw badRequest("clubAdvisor.notAdvisor");
    }

    await auditService.record({
      universityId: active.universityId,
      actorId: advisorUserId,
      action: "club.advisor.withdrawn",
      method: "POST",
      path: `/api/users/me/advised-clubs/${clubId}/withdraw`,
      status: 200,
      targetType: "club",
      targetId: clubId,
      metadata: { reason },
    });

    const club = await clubsRepository.findClubById(clubId);
    const lastInvite = await clubAdvisorsRepository.findLatestInvitationForPair(clubId, advisorUserId);
    if (club) {
      await notifyInviter(lastInvite?.invitedBy ?? null, club.name, clubId, "withdrawn");
    }

    await clubEffects.detailChanged.emit(clubId);

    return { clubId };
  },

  getAdvisorVacancy(activeAdvisorCount: number) {
    return {
      hasAdvisor: activeAdvisorCount > 0,
      advisorVacant: activeAdvisorCount === 0,
    };
  },
};
