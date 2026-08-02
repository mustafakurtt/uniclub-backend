import { announcementsRepository } from "./announcements.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import {
  CreateAnnouncementDTO,
  CreateUniversityAnnouncementDTO,
  UpdateAnnouncementDTO,
  UpdateUniversityAnnouncementDTO,
} from "./announcements.schema";
import { AnnouncementPermission } from "./announcements.permissions";
import { badRequest, notFound } from "../../shared/utils/errors";
import { announcementsCache, announcementEffects } from "./announcements.cache";
import { dispatchNotificationFanout } from "../notifications/notifications.fanout";
import { NotificationType } from "../notifications/notifications.types";
import { resolveAuthz } from "../../shared/rbac/rbac.cache";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { resolveScheduledPublishAt } from "../../shared/publishing/schedule.util";
import {
  cancelScheduledPublish,
  enqueueScheduledPublish,
} from "../../shared/publishing/scheduled-publish.queue";
import type { Announcement, UpdateAnnouncementPayload } from "./announcements.types";

type AnnouncementRow = Awaited<ReturnType<typeof announcementsRepository.findByClubForStaff>>[number];
type UniversityAnnouncementRow = Awaited<
  ReturnType<typeof announcementsRepository.findByUniversityForStaff>
>[number];

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

  /**
   * Okul geneli duyuru listesi. Yönetim yetkisi taslakları görür; diğer tenant
   * kullanıcıları yalnızca yayınlanmışları alır.
   */
  async listByUniversity(universityId: string, viewerId: string, viewerUniversityId: string | null) {
    assertTenantViewer(universityId, viewerUniversityId);

    const authz = await resolveAuthz(viewerId);
    const canManage = authz.permissions.includes(AnnouncementPermission.UNIVERSITY_MANAGE);

    const rows = canManage
      ? await announcementsCache.universityStaffList(universityId).read(() =>
          announcementsRepository.findByUniversityForStaff(universityId)
        )
      : await announcementsCache.universityPublishedList(universityId).read(() =>
          announcementsRepository.findPublishedByUniversity(universityId)
        );

    return rows.filter((a) => a.author).map((a) => ({ ...a, author: toSafeUser(a.author!) }));
  },

  async getUniversityDetail(
    universityId: string,
    viewerId: string,
    viewerUniversityId: string | null,
    announcementId: string
  ) {
    assertTenantViewer(universityId, viewerUniversityId);

    const authz = await resolveAuthz(viewerId);
    const canManage = authz.permissions.includes(AnnouncementPermission.UNIVERSITY_MANAGE);

    const row = await announcementsRepository.findUniversityAnnouncementDetail(universityId, announcementId);
    if (!row || !row.author) {
      throw notFound("announcement.notFound");
    }

    if (!canManage && row.status !== "published") {
      throw notFound("announcement.notFound");
    }

    return { ...row, author: toSafeUser(row.author) };
  },

  async create(universityId: string, clubId: string, authorId: string, data: CreateAnnouncementDTO) {
    if (data.pinned) {
      await assertPinnedCapacity(universityId, clubId);
    }

    const scheduledAt = data.scheduledPublishAtLocal
      ? await resolveScheduledPublishAt(universityId, data.scheduledPublishAtLocal)
      : null;

    const announcement = await announcementsRepository.add(universityId, clubId, authorId, {
      title: data.title,
      content: data.content,
      visibility: data.visibility,
      pinned: data.pinned,
      publish: data.publish && !scheduledAt,
      scheduledPublishAt: scheduledAt,
    });

    if (scheduledAt) {
      await enqueueScheduledPublish("announcement", announcement.id, scheduledAt);
    } else if (data.publish) {
      await notifyClubMembersPublished(clubId, announcement, authorId);
    }

    await announcementEffects.changed.emit(clubId);
    return announcement;
  },

  async createUniversity(
    universityId: string,
    authorId: string,
    data: CreateUniversityAnnouncementDTO
  ) {
    if (data.pinned) {
      await assertUniversityPinnedCapacity(universityId);
    }

    const scheduledAt = data.scheduledPublishAtLocal
      ? await resolveScheduledPublishAt(universityId, data.scheduledPublishAtLocal)
      : null;

    const announcement = await announcementsRepository.addUniversity(universityId, authorId, {
      title: data.title,
      content: data.content,
      pinned: data.pinned,
      publish: data.publish && !scheduledAt,
      scheduledPublishAt: scheduledAt,
    });

    if (scheduledAt) {
      await enqueueScheduledPublish("announcement", announcement.id, scheduledAt);
    } else if (data.publish) {
      await notifyTenantPublished(universityId, announcement, authorId);
    }

    await announcementEffects.universityChanged.emit(universityId);
    return announcement;
  },

  /** BullMQ worker — zamanlanmış kulüp/okul duyurusu yayını (idempotent). */
  async publishScheduled(announcementId: string) {
    const existing = await announcementsRepository.findById(announcementId);
    if (!existing || existing.status !== "draft" || !existing.scheduledPublishAt) {
      return;
    }
    if (existing.scheduledPublishAt.getTime() > Date.now()) {
      return;
    }

    const firstPublish = existing.publishedAt == null;
    const rows = await announcementsRepository.publishAnnouncement(announcementId);
    if (rows.length === 0) {
      return;
    }
    const published = rows[0];

    if (firstPublish) {
      if (published.clubId) {
        await notifyClubMembersPublished(published.clubId, published, published.authorId);
        await announcementEffects.changed.emit(published.clubId);
      } else {
        await notifyTenantPublished(published.universityId, published, published.authorId);
        await announcementEffects.universityChanged.emit(published.universityId);
      }
      return;
    }

    if (published.clubId) {
      await announcementEffects.changed.emit(published.clubId);
    } else {
      await announcementEffects.universityChanged.emit(published.universityId);
    }
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

  async publishUniversity(universityId: string, announcementId: string, actorUserId: string) {
    const existing = await announcementsRepository.findInUniversity(universityId, announcementId);
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
      await notifyTenantPublished(universityId, published, actorUserId);
    }

    await announcementEffects.universityChanged.emit(universityId);
    return published;
  },

  async update(clubId: string, announcementId: string, data: UpdateAnnouncementDTO) {
    const existing = await announcementsRepository.findInClub(clubId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }

    if (data.pinned === true && !existing.pinned) {
      await assertPinnedCapacity(existing.universityId, clubId);
    }

    const scheduledAt = await resolveSchedulePatch(
      existing.universityId,
      announcementId,
      existing,
      data.scheduledPublishAtLocal
    );

    const patch: UpdateAnnouncementPayload = {
      title: data.title,
      content: data.content,
      pinned: data.pinned,
      visibility: data.visibility,
    };
    if (scheduledAt !== undefined) {
      patch.scheduledPublishAt = scheduledAt;
    }
    applyEditedAtIfPublished(existing, data, patch);

    const [updated] = await announcementsRepository.updateInClub(clubId, announcementId, patch);
    if (!updated) {
      throw notFound("announcement.notFound");
    }

    await announcementEffects.changed.emit(clubId);
    return updated;
  },

  async updateUniversity(
    universityId: string,
    announcementId: string,
    data: UpdateUniversityAnnouncementDTO
  ) {
    const existing = await announcementsRepository.findInUniversity(universityId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }

    if (data.pinned === true && !existing.pinned) {
      await assertUniversityPinnedCapacity(universityId);
    }

    const scheduledAt = await resolveSchedulePatch(
      universityId,
      announcementId,
      existing,
      data.scheduledPublishAtLocal
    );

    const patch: {
      title?: string;
      content?: string;
      pinned?: boolean;
      scheduledPublishAt?: Date | null;
      editedAt?: Date | null;
    } = {
      title: data.title,
      content: data.content,
      pinned: data.pinned,
    };
    if (scheduledAt !== undefined) {
      patch.scheduledPublishAt = scheduledAt;
    }
    applyEditedAtIfPublished(existing, data, patch);

    const [updated] = await announcementsRepository.updateInUniversity(universityId, announcementId, patch);
    if (!updated) {
      throw notFound("announcement.notFound");
    }

    await announcementEffects.universityChanged.emit(universityId);
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

  async removeUniversity(universityId: string, announcementId: string) {
    const existing = await announcementsRepository.findInUniversity(universityId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }
    await announcementsRepository.removeFromUniversity(universityId, announcementId);
    await announcementEffects.universityChanged.emit(universityId);
  },
};

function assertTenantViewer(universityId: string, viewerUniversityId: string | null) {
  if (viewerUniversityId !== universityId) {
    throw notFound("announcement.notFound");
  }
}

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

function applyEditedAtIfPublished(
  existing: Announcement,
  data: { title?: string; content?: string },
  patch: { editedAt?: Date | null }
) {
  const titleChanged = data.title !== undefined && data.title !== existing.title;
  const contentChanged = data.content !== undefined && data.content !== existing.content;
  if (existing.status === "published" && (titleChanged || contentChanged)) {
    patch.editedAt = new Date();
  }
}

async function assertPinnedCapacity(universityId: string, clubId: string) {
  const settings = await getTenantSettings(universityId);
  const pinnedCount = await announcementsRepository.countPinnedInClub(clubId);
  if (pinnedCount >= settings.clubPinnedAnnouncementsMax) {
    throw badRequest("announcement.pinnedLimit");
  }
}

async function assertUniversityPinnedCapacity(universityId: string) {
  const settings = await getTenantSettings(universityId);
  const pinnedCount = await announcementsRepository.countPinnedInUniversity(universityId);
  if (pinnedCount >= settings.universityPinnedAnnouncementsMax) {
    throw badRequest("announcement.universityPinnedLimit");
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
  await dispatchNotificationFanout(recipients, {
    type: NotificationType.ANNOUNCEMENT_PUBLISHED,
    title: "Yeni duyuru",
    body: announcement.title,
    data: { announcementId: announcement.id, clubId },
  });
}

/** Okul geneli yayın bildirimi: tenant'taki tüm aktif kullanıcılara; yazar hariç. */
async function notifyTenantPublished(
  universityId: string,
  announcement: Announcement,
  authorId: string
) {
  const userIds = await announcementsRepository.getTenantActiveUserIds(universityId);
  const recipients = userIds.filter((id) => id !== authorId);
  await dispatchNotificationFanout(recipients, {
    type: NotificationType.ANNOUNCEMENT_UNIVERSITY_PUBLISHED,
    title: "Okul duyurusu",
    body: announcement.title,
    data: { announcementId: announcement.id, universityId },
  });
}

async function resolveSchedulePatch(
  universityId: string,
  announcementId: string,
  existing: Announcement,
  localIso: string | null | undefined
): Promise<Date | null | undefined> {
  if (localIso === undefined) {
    return undefined;
  }
  if (existing.status !== "draft") {
    throw badRequest("schedule.notDraft");
  }
  if (localIso === null) {
    await cancelScheduledPublish("announcement", announcementId);
    return null;
  }
  const at = await resolveScheduledPublishAt(universityId, localIso);
  await enqueueScheduledPublish("announcement", announcementId, at);
  return at;
}
