import { clubsAdminRepository } from "./clubs-admin.repository";
import { adminUsersRepository } from "../admin/admin-users.repository";
import { UpdateClubStatusDTO, UpdateClubDTO } from "./clubs-admin.schema";
import { toSafeUser } from "../../shared/utils/user.util";
import { notFound, badRequest } from "../../shared/utils/errors";
import { clubEffects } from "./clubs.cache";
import { clubAdvisorsService } from "../club-advisors/club-advisors.service";
import { auditService } from "../audit/audit.service";
import { announcementEffects } from "../announcements/announcements.cache";
import { galleryEffects } from "../gallery/gallery.cache";

function parseKeysetCursor(cursor?: string): Date | undefined {
  if (!cursor) return undefined;
  const cursorDate = new Date(cursor);
  if (Number.isNaN(cursorDate.getTime())) {
    throw badRequest("validation.failed");
  }
  return cursorDate;
}

function paginateByCreatedAt<T extends { createdAt: Date }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;
  return { items, nextCursor };
}

function paginateByStartsAt<T extends { startsAt: Date }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].startsAt.toISOString() : null;
  return { items, nextCursor };
}

export const clubsAdminService = {
  async listClubs(universityId: string, status?: "pending" | "approved" | "rejected" | "archived") {
    return await clubsAdminRepository.findClubsByUniversity(universityId, status);
  },

  async getClub(universityId: string, clubId: string) {
    const row = await clubsAdminRepository.findClubDetailWithCounts(universityId, clubId);
    if (!row) {
      throw notFound("admin.clubNotFound");
    }
    const { club, memberCount, pendingJoinRequests, advisorCount, upcomingActivities } = row;
    return {
      ...club,
      counts: {
        members: memberCount,
        pendingJoinRequests,
        upcomingActivities,
        advisors: advisorCount,
      },
    };
  },

  async updateClubStatus(universityId: string, clubId: string, data: UpdateClubStatusDTO) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const updated = await clubsAdminRepository.updateClubStatus(universityId, clubId, data.status);
    // Durum onaylı<->diğer geçişi public listeye giriş/çıkışı belirler.
    await clubEffects.clubChangedDeeply.emit(universityId, clubId);
    return updated;
  },

  async updateClub(universityId: string, clubId: string, data: UpdateClubDTO) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const updated = await clubsAdminRepository.updateClub(universityId, clubId, data);
    await clubEffects.profileChanged.emit(universityId, clubId); // isim/logo listede + profilde
    return updated;
  },

  /**
   * Kulübü kalıcı olarak siler.
   * 1. Kulüp bu üniversiteye ait olmalı.
   * 2. Yalnızca "archived" veya "rejected" durumdaki kulüpler silinebilir —
   *    aktif (approved/pending) bir kulübü doğrudan silmek yerine önce arşivle.
   * 3. Bağlı içerik repository'de tek transaction'da temizlenir.
   */
  async deleteClub(universityId: string, clubId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    if (club.status !== "archived" && club.status !== "rejected") {
      throw badRequest("admin.clubNotArchivedOrRejected");
    }
    await clubsAdminRepository.deleteClub(universityId, clubId);
    await clubEffects.clubChangedDeeply.emit(universityId, clubId);
    // Silinen kulübün duyuru/galeri listeleri de düşsün (repo bunları da temizler).
    await announcementEffects.changed.emit(clubId);
    await galleryEffects.changed.emit(clubId);
    return { id: clubId };
  },

  async listAdvisors(universityId: string, clubId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const advisors = await clubsAdminRepository.findAdvisorsByClub(clubId);
    return advisors
      .filter((a) => a.user)
      .map((a) => ({ ...a, user: toSafeUser(a.user!) }));
  },

  /**
   * Danışman daveti — kabul edilene kadar kulüpte danışman sayılmaz.
   */
  async inviteAdvisor(
    universityId: string,
    clubId: string,
    invitedBy: string,
    data: { userId: string; message?: string }
  ) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const user = await adminUsersRepository.findUserInUniversity(universityId, data.userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }

    const invitation = await clubAdvisorsService.inviteAdvisor(
      universityId,
      clubId,
      invitedBy,
      data,
      (userId) => adminUsersRepository.userHasRole(userId, "advisor")
    );
    await clubEffects.detailChanged.emit(clubId);
    return invitation;
  },

  async listAdvisorInvitations(universityId: string, clubId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    return await clubAdvisorsService.listClubInvitations(universityId, clubId);
  },

  async cancelAdvisorInvitation(
    universityId: string,
    clubId: string,
    invitationId: string,
    actorId: string
  ) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const result = await clubAdvisorsService.cancelInvitation(universityId, clubId, invitationId, actorId);
    await clubEffects.detailChanged.emit(clubId);
    return result;
  },

  /** Eski uç uyumluluğu — doğrudan atama yerine davet gönderir. */
  async addAdvisor(universityId: string, clubId: string, userId: string, invitedBy: string) {
    return await this.inviteAdvisor(universityId, clubId, invitedBy, { userId });
  },

  async removeAdvisor(universityId: string, clubId: string, userId: string, actorId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const existing = await clubsAdminRepository.findAdvisor(clubId, userId);
    if (!existing) {
      throw badRequest("admin.advisorNotAssigned");
    }
    await clubsAdminRepository.removeAdvisor(clubId, userId);
    await auditService.record({
      universityId,
      actorId,
      action: "club.advisor.removed",
      method: "DELETE",
      path: `/api/admin/universities/${universityId}/clubs/${clubId}/advisors/${userId}`,
      status: 200,
      targetType: "club",
      targetId: clubId,
      metadata: { userId },
    });
    await clubEffects.detailChanged.emit(clubId);
  },

  // ═══════════════════════════════════════════════
  // TENANT MODERASYON (bkz. docs/design/06 §A6)
  // Her işlem önce kulübün bu üniversiteye ait olduğunu doğrular; içerik de
  // gerçekten o kulübe ait olmalı (çapraz-kulüp silme engellenir).
  // ═══════════════════════════════════════════════
  async listClubMembers(universityId: string, clubId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const members = await clubsAdminRepository.findMembersByClub(clubId);
    return members
      .filter((m) => m.user)
      .map((m) => ({ ...m, user: toSafeUser(m.user!) }));
  },

  async listClubAnnouncements(
    universityId: string,
    clubId: string,
    limit: number,
    cursor?: string
  ) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const cursorDate = parseKeysetCursor(cursor);
    const rows = await clubsAdminRepository.listClubAnnouncementsForAdmin(clubId, limit, cursorDate);
    const { items, nextCursor } = paginateByCreatedAt(rows, limit);
    return {
      items: items
        .filter((a) => a.author)
        .map((a) => ({ ...a, author: toSafeUser(a.author!) })),
      nextCursor,
    };
  },

  async listClubGallery(
    universityId: string,
    clubId: string,
    limit: number,
    cursor?: string
  ) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const cursorDate = parseKeysetCursor(cursor);
    const rows = await clubsAdminRepository.listClubGalleryForAdmin(clubId, limit, cursorDate);
    const { items, nextCursor } = paginateByCreatedAt(rows, limit);
    return {
      items: items
        .filter((img) => img.uploader)
        .map((img) => ({ ...img, uploader: toSafeUser(img.uploader!) })),
      nextCursor,
    };
  },

  async listClubActivities(
    universityId: string,
    clubId: string,
    limit: number,
    cursor?: string
  ) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const cursorDate = parseKeysetCursor(cursor);
    const rows = await clubsAdminRepository.listClubActivitiesForAdmin(clubId, limit, cursorDate);
    const { items, nextCursor } = paginateByStartsAt(rows, limit);
    return { items, nextCursor };
  },

  async removeClubMember(universityId: string, clubId: string, userId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const membership = await clubsAdminRepository.findClubMember(clubId, userId);
    if (!membership) {
      throw badRequest("admin.memberNotFound");
    }
    await clubsAdminRepository.removeClubMember(clubId, userId);
    await clubEffects.membershipChanged.emit(clubId); // üye listesi + profil (üye gömülü)
  },

  async moderateRemoveAnnouncement(universityId: string, clubId: string, announcementId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const announcement = await clubsAdminRepository.findAnnouncementInClub(clubId, announcementId);
    if (!announcement) {
      throw notFound("admin.announcementNotFound");
    }
    await clubsAdminRepository.deleteAnnouncement(announcementId);
    await announcementEffects.changed.emit(clubId);
  },

  async moderateRemoveGalleryImage(universityId: string, clubId: string, imageId: string) {
    const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const image = await clubsAdminRepository.findGalleryImageInClub(clubId, imageId);
    if (!image) {
      throw notFound("admin.galleryImageNotFound");
    }
    await clubsAdminRepository.deleteGalleryImage(imageId);
    await galleryEffects.changed.emit(clubId);
  },
};
