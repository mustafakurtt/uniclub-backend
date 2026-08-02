import { clubsRepository } from "./clubs.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { notFound, badRequest } from "../../shared/utils/errors";
import { clubsCache, clubEffects } from "./clubs.cache";
import { UpdateMemberRoleDTO } from "./clubs.schema";
import { membershipHistoryService } from "../membership-history/membership-history.service";

/** Üyelik, katılım istekleri, rol değişimi ve başkanlık devri. */
export const clubsMembershipService = {
  /** Kulübün onaylı üyeleri (rolleriyle) — kulüp var olmalı ve bu üniversiteye ait olmalı. */
  async listMembers(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    // Tenant guard (yukarıda) cache DIŞINDA; üye listesi clubId ile cache'lenir.
    const members = await clubsCache.members(clubId).read(() =>
      clubsRepository.findApprovedMembers(clubId)
    );
    return members
      .filter((m) => m.user)
      .map((m) => ({ ...m, user: toSafeUser(m.user!) }));
  },

  /**
   * Kulübe katılma.
   * 1. Kulüp bu üniversitede ve "approved" durumda olmalı (pending/rejected/archived
   *    kulüplere katılınamaz).
   * 2. Zaten üye/bekleyen istek yoksa; joinPolicy'ye göre approved ya da pending oluşur.
   */
  async joinClub(universityId: string, clubId: string, userId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    if (club.status !== "approved") {
      throw badRequest("club.notOpenForMembership");
    }

    const existingMembership = await clubsRepository.findMembership(clubId, userId);
    if (existingMembership) {
      throw badRequest("club.alreadyMemberOrPending");
    }

    const status = club.joinPolicy === "open" ? "approved" : "pending";
    // Tenant, KULÜBÜN kaydından alınır (çağırandan değil): `findClubInUniversity`
    // zaten kulübün bu tenant'ta olduğunu doğruladı, dolayısıyla ikisi eşit —
    // ama kaynağı kulüp yapmak, bileşik FK'nin beklediği değeri tek doğru
    // yerden okumak demek (bkz. db/schema.ts → clubMembers).
    const membership = await clubsRepository.addMembership(
      clubId,
      userId,
      club.universityId,
      status
    );
    if (status === "approved") {
      await membershipHistoryService.recordJoined(
        clubId,
        userId,
        club.universityId,
        "member",
        userId
      );
      await clubEffects.membershipChanged.emit(clubId);
    }
    return membership;
  },

  async leaveClub(universityId: string, clubId: string, userId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const membership = await clubsRepository.findMembership(clubId, userId);
    if (!membership) {
      throw badRequest("club.notAMember");
    }

    if (membership.role === "president") {
      throw badRequest("club.presidentCannotLeave");
    }

    await clubsRepository.removeMembership(clubId, userId);
    await membershipHistoryService.recordLeft(clubId, userId, club.universityId, membership.role);
    // Ayrılan üye onaylıysa listeyi/profili etkiler; pending istekte membership
    // zaten listede değildi ama invalidasyon ucuz + güvenli.
    await clubEffects.membershipChanged.emit(clubId);
  },

  async listJoinRequests(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    const requests = await clubsRepository.findPendingJoinRequests(clubId);
    return requests
      .filter((r) => r.user)
      .map((r) => ({ ...r, user: toSafeUser(r.user!) }));
  },

  async decideJoinRequest(
    clubId: string,
    targetUserId: string,
    decision: "approved" | "rejected",
    actorId: string
  ) {
    const membership = await clubsRepository.findMembership(clubId, targetUserId);
    if (!membership || membership.status !== "pending") {
      throw notFound("club.pendingJoinRequestNotFound");
    }
    const updated = await clubsRepository.updateMembershipStatus(clubId, targetUserId, decision);
    if (decision === "approved") {
      await membershipHistoryService.recordJoined(
        clubId,
        targetUserId,
        membership.universityId,
        membership.role,
        actorId
      );
      await clubEffects.membershipChanged.emit(clubId);
    } else {
      await membershipHistoryService.recordJoinRejected(
        clubId,
        targetUserId,
        membership.universityId,
        actorId
      );
    }

    const club = await clubsRepository.findClubById(clubId);
    const approved = decision === "approved";
    await notificationsService.notifySafe(targetUserId, {
      type: NotificationType.CLUB_MEMBERSHIP_DECIDED,
      title: approved ? "Kulübe kabul edildiniz" : "Kulüp katılım isteğiniz reddedildi",
      body: approved
        ? `'${club?.name ?? "Kulüp"}' üyeliğiniz onaylandı.`
        : `'${club?.name ?? "Kulüp"}' katılım isteğiniz olumsuz sonuçlandı.`,
      data: { clubId, status: decision },
    });

    return updated;
  },

  async removeMember(clubId: string, targetUserId: string, actorId: string) {
    const membership = await clubsRepository.findMembership(clubId, targetUserId);
    if (!membership) {
      throw notFound("club.memberNotFound");
    }
    if (membership.role === "president") {
      throw badRequest("club.presidentCannotBeRemoved");
    }
    await clubsRepository.removeMembership(clubId, targetUserId);
    await membershipHistoryService.recordRemoved(
      clubId,
      targetUserId,
      membership.universityId,
      membership.role,
      actorId
    );
    await clubEffects.membershipChanged.emit(clubId);
  },

  /**
   * Sadece member <-> officer arasında geçiş yapılabilir; başkanlık devri
   * ayrı bir endpoint'tir (transferPresidency).
   */
  async updateMemberRole(clubId: string, targetUserId: string, data: UpdateMemberRoleDTO, actorId: string) {
    const membership = await clubsRepository.findMembership(clubId, targetUserId);
    if (!membership || membership.status !== "approved") {
      throw notFound("club.memberNotFound");
    }
    if (membership.role === "president") {
      throw badRequest("club.presidentRoleCannotChange");
    }
    const updated = await clubsRepository.updateMembershipRole(clubId, targetUserId, data.role);
    await membershipHistoryService.recordRoleChanged(
      clubId,
      targetUserId,
      membership.universityId,
      membership.role,
      data.role,
      actorId
    );
    await clubEffects.membershipChanged.emit(clubId); // rol üye listesinde görünür
    return updated;
  },

  /**
   * Başkanlık devri (sadece mevcut başkan tetikler).
   * 1. Hedef, başkanın kendisi olamaz.
   * 2. Hedef, kulübün ONAYLI bir üyesi olmalı.
   * 3. Devir sonrası eski başkan officer'a düşer, yeni kişi başkan olur (tek transaction).
   */
  async transferPresidency(clubId: string, currentPresidentId: string, newPresidentId: string) {
    if (currentPresidentId === newPresidentId) {
      throw badRequest("club.cannotTransferToSelf");
    }

    const target = await clubsRepository.findMembership(clubId, newPresidentId);
    if (!target || target.status !== "approved") {
      throw badRequest("club.newPresidentMustBeApprovedMember");
    }

    const result = await clubsRepository.transferPresidency(clubId, currentPresidentId, newPresidentId);
    const club = await clubsRepository.findClubById(clubId);
    if (club) {
      await membershipHistoryService.recordRoleChanged(
        clubId,
        currentPresidentId,
        club.universityId,
        "president",
        "officer",
        currentPresidentId
      );
      await membershipHistoryService.recordRoleChanged(
        clubId,
        newPresidentId,
        club.universityId,
        target.role,
        "president",
        currentPresidentId
      );
    }
    await clubEffects.membershipChanged.emit(clubId); // roller üye listesinde görünür
    return result;
  },
};
