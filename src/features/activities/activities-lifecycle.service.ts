import { activitiesRepository } from "./activities.repository";
import { activityEffects } from "./activities.cache";
import { notFound, badRequest } from "../../shared/utils/errors";
import { dispatchNotificationFanout } from "../notifications/notifications.fanout";
import { NotificationType } from "../notifications/notifications.types";
import { resolveScheduledPublishAt } from "../../shared/publishing/schedule.util";
import {
  cancelScheduledPublish,
  enqueueScheduledPublish,
} from "../../shared/publishing/scheduled-publish.queue";
import { CreateActivityDTO, UpdateActivityDTO } from "./activities.schema";
import type { Activity, ActivityVisibility } from "./activities.types";
import { socialPreviewService } from "../social-preview/social-preview.service";
import { clubsRepository } from "../clubs/clubs.repository";
import {
  assertValidWindow,
  assertInterUniversityVisibilityAllowed,
  requireHostedActivity,
  toSafeUser,
} from "./activities-guards.util";

/**
 * Etkinlik yaşam döngüsü — host staff yönetimi, co-host, tenant moderasyonu.
 * Keşif/RSVP/yoklama bu servisten ayrı; ortak guard'lar activities-guards.util'de.
 */
export const activitiesLifecycleService = {
  /**
   * Kulübün (host olarak) yeni etkinlik oluşturması.
   * 1. Başlangıç geçmişte olamaz; bitiş (varsa) başlangıçtan önce olamaz.
   * 2. Etkinlik + tekil host bağı tek transaction'da kurulur. `publish=false` ise
   *    "draft" (taslak) doğar — dışarı görünmez, bildirim gitmez.
   * 3. Yayınlandıysa kulübün onaylı üyelerine "yeni etkinlik" bildirimi (yan etki).
   */
  async createForClub(hostClubId: string, createdBy: string, data: CreateActivityDTO) {
    // 1
    assertValidWindow(data.startsAt, data.endsAt);

    const universityId = await activitiesRepository.getClubUniversityId(hostClubId);
    if (!universityId) {
      throw notFound("club.notFound");
    }

    const scheduledAt = data.scheduledPublishAtLocal
      ? await resolveScheduledPublishAt(universityId, data.scheduledPublishAtLocal)
      : null;

    await assertInterUniversityVisibilityAllowed(hostClubId, createdBy, data.visibility);

    // 2
    const status = data.publish && !scheduledAt ? "published" : "draft";
    const activity = await activitiesRepository.createWithHost(hostClubId, createdBy, {
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      coverUrl: data.coverUrl ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt ?? null,
      capacity: data.capacity ?? null,
      visibility: data.visibility,
      scheduledPublishAt: scheduledAt,
    }, status);

    // 3
    if (scheduledAt) {
      await enqueueScheduledPublish("activity", activity.id, scheduledAt);
    } else if (status === "published") {
      await notifyMembersPublished(hostClubId, activity);
      await this.invalidateCache(activity.id);
    }
    return activity;
  },

  /** BullMQ worker — zamanlanmış etkinlik yayını (idempotent). */
  async publishScheduled(activityId: string) {
    const activity = await activitiesRepository.findById(activityId);
    if (!activity || activity.status !== "draft" || !activity.scheduledPublishAt) {
      return;
    }
    if (activity.scheduledPublishAt.getTime() > Date.now()) {
      return;
    }

    const hostClubId = await activitiesRepository.getHostClubId(activityId);
    if (!hostClubId) {
      return;
    }

    const published = await activitiesRepository.publishActivity(activityId);
    if (!published) {
      return;
    }

    await notifyMembersPublished(hostClubId, published);
    await this.invalidateCache(activityId);
  },

  /**
   * Taslak bir etkinliği yayınlar (host staff). Yalnızca "draft" yayınlanabilir;
   * yayınlanınca kulübün onaylı üyelerine bildirim gider.
   */
  async publishForClub(hostClubId: string, activityId: string) {
    const activity = await requireHostedActivity(hostClubId, activityId);
    if (activity.status !== "draft") {
      throw badRequest("activity.notDraft");
    }
    const published = await activitiesRepository.publishActivity(activityId);
    await notifyMembersPublished(hostClubId, published ?? activity);
    await this.invalidateCache(activityId);
    return published;
  },

  /**
   * Host kulübün etkinliği güncellemesi. İptal edilmiş etkinlik güncellenemez.
   * Tarih alanları geldiyse yeni pencere yine doğrulanır (mevcut değerle harmanlanarak).
   */
  async updateForClub(hostClubId: string, activityId: string, actorId: string, data: UpdateActivityDTO) {
    const activity = await requireHostedActivity(hostClubId, activityId);
    if (activity.status === "cancelled") {
      throw badRequest("activity.alreadyCancelled");
    }

    const startsAt = data.startsAt ?? activity.startsAt;
    const endsAt = data.endsAt ?? activity.endsAt;
    assertValidWindow(startsAt, endsAt);

    const universityId = await activitiesRepository.getClubUniversityId(hostClubId);
    if (!universityId) {
      throw notFound("club.notFound");
    }

    let scheduledPublishAt: Date | null | undefined = undefined;
    if (data.scheduledPublishAtLocal !== undefined) {
      if (activity.status !== "draft") {
        throw badRequest("schedule.notDraft");
      }
      if (data.scheduledPublishAtLocal === null) {
        await cancelScheduledPublish("activity", activityId);
        scheduledPublishAt = null;
      } else {
        const at = await resolveScheduledPublishAt(universityId, data.scheduledPublishAtLocal);
        await enqueueScheduledPublish("activity", activityId, at);
        scheduledPublishAt = at;
      }
    }

    if (data.visibility !== undefined) {
      await assertInterUniversityVisibilityAllowed(hostClubId, actorId, data.visibility);
    }

    const updated = await activitiesRepository.updateActivity(activityId, {
      title: data.title,
      description: data.description ?? undefined,
      location: data.location ?? undefined,
      coverUrl: data.coverUrl ?? undefined,
      startsAt: data.startsAt,
      endsAt: data.endsAt ?? undefined,
      capacity: data.capacity ?? undefined,
      visibility: data.visibility,
      ...(scheduledPublishAt !== undefined ? { scheduledPublishAt } : {}),
    });
    await this.invalidateCache(activityId);
    return updated;
  },

  /**
   * Host kulübün etkinliği iptal etmesi. Katılım bildiren herkese bildirim gider.
   */
  async cancelForClub(hostClubId: string, activityId: string) {
    const activity = await requireHostedActivity(hostClubId, activityId);
    if (activity.status === "cancelled") {
      throw badRequest("activity.alreadyCancelled");
    }

    const cancelled = await activitiesRepository.cancelActivity(activityId);
    await notifyAttendeesCancelled(activityId, activity);
    await this.invalidateCache(activityId);
    return cancelled;
  },

  /** SKS moderasyonu — görünürlük güncellemesi (activity.moderate). */
  async updateVisibilityForModerator(
    universityId: string,
    hostClubId: string,
    activityId: string,
    visibility: ActivityVisibility
  ) {
    const activity = await requireHostedActivity(hostClubId, activityId);
    if (activity.status === "cancelled") {
      throw badRequest("activity.alreadyCancelled");
    }
    if (!(await activitiesRepository.isActivityInUniversity(activityId, universityId))) {
      throw notFound("activity.notFound");
    }

    await assertInterUniversityVisibilityAllowed(hostClubId, "", visibility, { allowModerator: true });

    const updated = await activitiesRepository.updateActivity(activityId, { visibility });
    await this.invalidateCache(activityId);
    return updated;
  },

  /** Host kulübün etkinliğinin katılımcı listesi (güvenli kullanıcı objeleriyle). */
  async listAttendeesForClub(hostClubId: string, activityId: string) {
    await requireHostedActivity(hostClubId, activityId);
    const rows = await activitiesRepository.listAttendees(activityId);
    return rows
      .filter((r) => r.user)
      .map((r) => ({
        status: r.status,
        checkedInAt: r.checkedInAt,
        createdAt: r.createdAt,
        user: toSafeUser(r.user!),
      }));
  },

  /**
   * Kulübün etkinlik listesi (kulüp sayfası). STAFF taslakları da görür; members
   * görünürlüğündekiler yalnızca üyeye/staff'a; sıradan ziyaretçiye yalnızca
   * yayınlanmış + university.
   */
  async listByClub(clubId: string, viewerId: string, universityId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const isStaff = await activitiesRepository.isClubStaff(clubId, viewerId);
    const canSeeMembers = isStaff || (await activitiesRepository.isApprovedMemberOfAny(viewerId, [clubId]));
    const rows = await activitiesRepository.listByClub(clubId, isStaff);
    const filtered = canSeeMembers ? rows : rows.filter((a) => a.visibility === "university");

    if (!(await socialPreviewService.isEnabled(universityId))) {
      return filtered;
    }

    const stats = await socialPreviewService.loadForActivities(universityId, filtered.map((a) => a.id));
    return socialPreviewService.attachActivitySocial(filtered, stats);
  },

  // ── Co-host davet/kabul ────────────────────────────────────────────────────
  /**
   * Host kulüp, başka bir kulübü (aynı ya da FARKLI üniversiteden — turnuva)
   * etkinliğe co-host davet eder. Davet `invited` doğar; hedef kulübün staff'ı
   * kabul edene kadar tenant/görünürlük/keşifte SAYILMAZ. Hedef staff'a bildirim.
   */
  async inviteCoHost(hostClubId: string, activityId: string, targetClubId: string) {
    await requireHostedActivity(hostClubId, activityId);
    if (targetClubId === hostClubId) {
      throw badRequest("activity.coHostSelf");
    }
    if (!(await activitiesRepository.clubExists(targetClubId))) {
      throw notFound("club.notFound");
    }
    if (await activitiesRepository.findActivityClub(activityId, targetClubId)) {
      throw badRequest("activity.coHostExists");
    }

    const row = await activitiesRepository.addCoHostInvite(activityId, targetClubId);
    await notifyCoHostInvited(hostClubId, targetClubId, activityId);
    return row;
  },

  /** Davet edilen kulübün staff'ı daveti kabul eder → co-host artık `accepted`. */
  async acceptCoHostInvite(clubId: string, activityId: string) {
    const link = await activitiesRepository.findActivityClub(activityId, clubId);
    if (!link || link.role !== "co_host" || link.status !== "invited") {
      throw notFound("activity.coHostInviteNotFound");
    }
    const row = await activitiesRepository.setCoHostAccepted(activityId, clubId);
    // Kabul sonrası yeni üniversite accepted oldu → o tenant'ın keşfi de tazelenir.
    await this.invalidateCache(activityId);
    return row;
  },

  /** Host kulüp bir co-host bağını (davet veya kabul edilmiş) kaldırır. */
  async removeCoHost(hostClubId: string, activityId: string, coClubId: string) {
    await requireHostedActivity(hostClubId, activityId);
    const link = await activitiesRepository.findActivityClub(activityId, coClubId);
    if (!link || link.role !== "co_host") {
      throw notFound("activity.coHostInviteNotFound");
    }
    // Kaldırmadan ÖNCE etkilenen üniversiteleri yakala (kaldırınca accepted seti değişir).
    const unis = await activitiesRepository.getAcceptedUniversityIds(activityId);
    await activitiesRepository.removeActivityClub(activityId, coClubId);
    await this.invalidateCache(activityId, unis);
  },

  /** Co-host kulübün staff'ı daveti reddeder / ortaklıktan ayrılır. */
  async leaveCoHost(clubId: string, activityId: string) {
    const link = await activitiesRepository.findActivityClub(activityId, clubId);
    if (!link || link.role !== "co_host") {
      throw notFound("activity.coHostInviteNotFound");
    }
    const unis = await activitiesRepository.getAcceptedUniversityIds(activityId);
    await activitiesRepository.removeActivityClub(activityId, clubId);
    await this.invalidateCache(activityId, unis);
  },

  /**
   * TENANT MODERASYONU (activity.moderate): okul yöneticisi/moderatör, kendi
   * üniversitesindeki HERHANGİ bir kulübün etkinliğini iptal eder (host olması
   * gerekmez). Etkinlik bu tenant'a ait değilse "bulunamadı" (izolasyon).
   */
  async moderateCancel(universityId: string, activityId: string) {
    const activity = await activitiesRepository.findById(activityId);
    if (!activity || !(await activitiesRepository.isActivityInUniversity(activityId, universityId))) {
      throw notFound("activity.notFound");
    }
    if (activity.status === "cancelled") {
      throw badRequest("activity.alreadyCancelled");
    }
    const cancelled = await activitiesRepository.cancelActivity(activityId);
    await notifyAttendeesCancelled(activityId, activity);
    await this.invalidateCache(activityId);
    return cancelled;
  },

  /** Host kulübün gördüğü co-host listesi (davet bekleyen + kabul eden, status'leriyle). */
  async listCoHosts(hostClubId: string, activityId: string) {
    await requireHostedActivity(hostClubId, activityId);
    const rows = await activitiesRepository.listActivityClubs(activityId);
    return rows
      .filter((r) => r.role === "co_host")
      .map((r) => ({ clubId: r.clubId, status: r.status, club: r.club, createdAt: r.createdAt }));
  },

  /** Etkinlik cache'ini geçersiz kıl: detayı + etkilenen üniversitelerin keşif listeleri. */
  async invalidateCache(activityId: string, universityIds?: string[]) {
    const unis = universityIds ?? (await activitiesRepository.getAcceptedUniversityIds(activityId));
    await activityEffects.activityChanged.emit(activityId, unis);
  },
};

/** Yayın bildirimi: host kulübün onaylı üyelerine (yan etki, hataları yutulur). */
async function notifyMembersPublished(hostClubId: string, activity: Activity) {
  const memberIds = await activitiesRepository.getApprovedMemberIds(hostClubId);
  const recipients = memberIds.filter((id) => id !== activity.createdBy);
  await dispatchNotificationFanout(recipients, {
    type: NotificationType.ACTIVITY_PUBLISHED,
    title: "Yeni etkinlik",
    body: activity.title,
    data: { activityId: activity.id, clubId: hostClubId },
  });
}

/** Co-host daveti bildirimi: hedef kulübün staff'ına (officer/president + danışman). */
async function notifyCoHostInvited(hostClubId: string, targetClubId: string, activityId: string) {
  const staffIds = await activitiesRepository.getStaffIds(targetClubId);
  await dispatchNotificationFanout(staffIds, {
    type: NotificationType.ACTIVITY_COHOST_INVITED,
    title: "Co-host daveti",
    body: "Kulübünüz bir etkinliğe co-host olarak davet edildi.",
    data: { activityId, hostClubId, clubId: targetClubId },
  });
}

/** İptal bildirimi: katılım bildiren herkese (yan etki). */
async function notifyAttendeesCancelled(activityId: string, activity: Activity) {
  const attendees = await activitiesRepository.listAttendees(activityId);
  const userIds = attendees.map((a) => a.userId);
  await dispatchNotificationFanout(userIds, {
    type: NotificationType.ACTIVITY_CANCELLED,
    title: "Etkinlik iptal edildi",
    body: activity.title,
    data: { activityId },
  });
}
