import { announcementsRepository } from "./announcements.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { CreateAnnouncementDTO, UpdateAnnouncementDTO } from "./announcements.schema";
import { badRequest, notFound } from "../../shared/utils/errors";
import { announcementsCache, announcementEffects } from "./announcements.cache";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import type { Announcement } from "./announcements.types";

/** Kulüp başına sabitlenen duyuru üst sınırı — vitrin alanını korur, pin özelliğini anlamsız kılmaz. */
export const MAX_PINNED_ANNOUNCEMENTS_PER_CLUB = 3;

type AnnouncementRow = Awaited<ReturnType<typeof announcementsRepository.findByClubForStaff>>[number];

export const announcementsService = {
  /**
   * Kulüp duyuru listesi. Staff taslakları da görür; üye/ziyaretçi yalnızca
   * yayınlanmış + görünürlük kurallarına uyanları alır.
   */
  async listByClub(clubId: string, viewerId: string) {
    const isStaff = await announcementsRepository.isClubStaff(clubId, viewerId);
    const isMember = await announcementsRepository.isApprovedMember(clubId, viewerId);

    const rows = isStaff
      ? await announcementsCache.staffList(clubId).read(() =>
          announcementsRepository.findByClubForStaff(clubId)
        )
      : await announcementsCache.publishedList(clubId).read(() =>
          announcementsRepository.findPublishedByClub(clubId)
        );

    const filtered = filterForViewer(rows, { isStaff, isMember });
    return filtered.filter((a) => a.author).map((a) => ({ ...a, author: toSafeUser(a.author!) }));
  },

  async create(universityId: string, clubId: string, authorId: string, data: CreateAnnouncementDTO) {
    if (data.pinned) {
      await assertPinnedCapacity(clubId);
    }

    const announcement = await announcementsRepository.add(universityId, clubId, authorId, {
      title: data.title,
      content: data.content,
      visibility: data.visibility,
      pinned: data.pinned,
      publish: data.publish,
    });

    if (data.publish) {
      await notifyClubMembersPublished(clubId, announcement, authorId);
    }

    await announcementEffects.changed.emit(clubId);
    return announcement;
  },

  async publish(clubId: string, announcementId: string, actorUserId: string) {
    const existing = await announcementsRepository.findInClub(clubId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }
    if (existing.status !== "draft") {
      throw badRequest("announcement.notDraft");
    }

    const firstPublish = existing.publishedAt == null;
    const rows = await announcementsRepository.publishAnnouncement(announcementId);
    if (rows.length === 0) {
      throw badRequest("announcement.notDraft");
    }
    const published = rows[0];

    if (firstPublish) {
      await notifyClubMembersPublished(clubId, published, actorUserId);
    }

    await announcementEffects.changed.emit(clubId);
    return published;
  },

  async update(clubId: string, announcementId: string, data: UpdateAnnouncementDTO) {
    const existing = await announcementsRepository.findInClub(clubId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }

    if (data.pinned === true && !existing.pinned) {
      await assertPinnedCapacity(clubId);
    }

    const [updated] = await announcementsRepository.updateInClub(clubId, announcementId, data);
    if (!updated) {
      throw notFound("announcement.notFound");
    }

    await announcementEffects.changed.emit(clubId);
    return updated;
  },

  async remove(clubId: string, announcementId: string) {
    const existing = await announcementsRepository.findInClub(clubId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }
    await announcementsRepository.removeFromClub(clubId, announcementId);
    await announcementEffects.changed.emit(clubId);
  },
};

function filterForViewer(
  rows: AnnouncementRow[],
  viewer: { isStaff: boolean; isMember: boolean }
) {
  if (viewer.isStaff) {
    return rows;
  }
  return rows.filter(
    (row) =>
      row.status === "published" &&
      (row.visibility === "university" || (row.visibility === "members" && viewer.isMember))
  );
}

async function assertPinnedCapacity(clubId: string) {
  const pinnedCount = await announcementsRepository.countPinnedInClub(clubId);
  if (pinnedCount >= MAX_PINNED_ANNOUNCEMENTS_PER_CLUB) {
    throw badRequest("announcement.pinnedLimit");
  }
}

/** Yayın bildirimi: kulüp üyelerine (görünürlükten bağımsız); yazar hariç. */
async function notifyClubMembersPublished(
  clubId: string,
  announcement: Announcement,
  authorId: string
) {
  const memberIds = await announcementsRepository.getApprovedMemberIds(clubId);
  const recipients = memberIds.filter((id) => id !== authorId);
  await notificationsService.notifyManySafe(recipients, {
    type: NotificationType.ANNOUNCEMENT_PUBLISHED,
    title: "Yeni duyuru",
    body: announcement.title,
    data: { announcementId: announcement.id, clubId },
  });
}
