import { activitiesRepository } from "./activities.repository";
import { activitiesCache, activityEffects } from "./activities.cache";
import { toSafeUser } from "../../shared/utils/user.util";
import { notFound, badRequest, forbidden } from "../../shared/utils/errors";
import { dispatchNotificationFanout } from "../notifications/notifications.fanout";
import { NotificationType } from "../notifications/notifications.types";
import { resolveScheduledPublishAt } from "../../shared/publishing/schedule.util";
import {
  cancelScheduledPublish,
  enqueueScheduledPublish,
} from "../../shared/publishing/scheduled-publish.queue";
import { CreateActivityDTO, UpdateActivityDTO, ListActivitiesQueryDTO, RsvpDTO } from "./activities.schema";
import { checkInQrCache } from "./check-in-qr.cache";
import type { Activity } from "./activities.types";

type ActivityDetail = NonNullable<Awaited<ReturnType<typeof activitiesRepository.findDetailById>>>;
type AcceptedClubLink = ActivityDetail["activityClubs"][number];

async function fetchActivityDetail(activityId: string): Promise<ActivityDetail> {
  const detail = await activitiesCache.detail(activityId).read(() =>
    activitiesRepository.findDetailById(activityId)
  );
  if (!detail) {
    throw notFound("activity.notFound");
  }
  return detail;
}

function acceptedClubLinks(detail: ActivityDetail): AcceptedClubLink[] {
  return detail.activityClubs.filter((ac) => ac.status === "accepted");
}

function assertActivityPublished(detail: ActivityDetail) {
  if (detail.status === "draft") {
    throw notFound("activity.notFound"); // taslak dışarı görünmez
  }
  if (detail.status === "cancelled") {
    throw badRequest("activity.cancelled");
  }
}

async function assertActivityVisibility(
  userId: string,
  acceptedClubs: AcceptedClubLink[],
  visibility: ActivityDetail["visibility"]
) {
  if (visibility !== "members") return;
  const clubIds = acceptedClubs.map((ac) => ac.clubId);
  const isMember = await activitiesRepository.isApprovedMemberOfAny(userId, clubIds);
  if (!isMember) {
    throw forbidden("activity.membersOnly");
  }
}

/** Accepted host/co-host kulüplerinin tenant kümesinde olma — ilk kapı; dış tenant'a varlık sızdırmaz. */
function assertAcceptedClubTenant(universityId: string, acceptedClubs: AcceptedClubLink[]) {
  const clubUniversityIds = acceptedClubs
    .map((ac) => ac.club?.universityId)
    .filter((id): id is string => id != null);
  if (!clubUniversityIds.includes(universityId)) {
    throw notFound("activity.notFound");
  }
}

/**
 * RSVP (ve detay) kapısı: tenant → yayın durumu → görünürlük.
 * Tenant ilk — kapsam dışı çağırana 404; görünürlük/iptal 403/400 sızdırmaz.
 * İki katman da geçmeli; "üstüne gelir" sıra değil, birlikte uygulanma anlamında.
 */
async function assertCanRsvp(userId: string, universityId: string, activityId: string) {
  const detail = await fetchActivityDetail(activityId);
  const accepted = acceptedClubLinks(detail);
  assertAcceptedClubTenant(universityId, accepted);
  assertActivityPublished(detail);
  await assertActivityVisibility(userId, accepted, detail.visibility);
  return detail;
}

/**
 * Etkinlik iş kuralları. İki yüzey:
 *  - Yönetim (host kulüp staff): oluştur/güncelle/iptal/katılımcılar — `clubId`
 *    club.middleware'den gelir; servis ayrıca kulübün gerçekten HOST olduğunu
 *    doğrular (co_host bir kulübün staff'ı etkinliği yönetemez).
 *  - Keşif/RSVP (tenant'taki herhangi bir kullanıcı): görünürlük + yayın +
 *    geçmiş + kapasite kuralları burada uygulanır.
 *
 * Bildirimler yan etkidir: `notifySafe` ile gönderilir, hatası asıl işlemi düşürmez.
 */
export const activitiesService = {
  // ═══════════════════════════════════════════════
  // YÖNETİM (host kulüp staff)
  // ═══════════════════════════════════════════════
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
    const activity = await this.requireHostedActivity(hostClubId, activityId);
    if (activity.status !== "draft") {
      throw badRequest("activity.notDraft");
    }
    const published = await activitiesRepository.publishActivity(activityId);
    await notifyMembersPublished(hostClubId, published ?? activity);
    await this.invalidateCache(activityId);
    return published;
  },

  /**
   * Yoklama (check-in): host staff, katılım bildiren bir kullanıcıyı "geldi"
   * olarak işaretler (`checkedIn=false` → işareti geri alır). RSVP'si yoksa 404.
   */
  async setCheckIn(hostClubId: string, activityId: string, userId: string, checkedIn: boolean) {
    await this.requireHostedActivity(hostClubId, activityId);
    const attendee = await activitiesRepository.findAttendee(activityId, userId);
    if (!attendee) {
      throw notFound("attendee.notAttendee");
    }
    return await activitiesRepository.setCheckIn(activityId, userId, checkedIn ? new Date() : null);
  },

  /**
   * Host kulübün etkinliği güncellemesi. İptal edilmiş etkinlik güncellenemez.
   * Tarih alanları geldiyse yeni pencere yine doğrulanır (mevcut değerle harmanlanarak).
   */
  async updateForClub(hostClubId: string, activityId: string, data: UpdateActivityDTO) {
    const activity = await this.requireHostedActivity(hostClubId, activityId);
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
    const activity = await this.requireHostedActivity(hostClubId, activityId);
    if (activity.status === "cancelled") {
      throw badRequest("activity.alreadyCancelled");
    }

    const cancelled = await activitiesRepository.cancelActivity(activityId);
    await notifyAttendeesCancelled(activityId, activity);
    await this.invalidateCache(activityId);
    return cancelled;
  },

  /** Host kulübün etkinliğinin katılımcı listesi (güvenli kullanıcı objeleriyle). */
  async listAttendeesForClub(hostClubId: string, activityId: string) {
    await this.requireHostedActivity(hostClubId, activityId);
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
  async listByClub(clubId: string, viewerId: string) {
    const isStaff = await activitiesRepository.isClubStaff(clubId, viewerId);
    const canSeeMembers = isStaff || (await activitiesRepository.isApprovedMemberOfAny(viewerId, [clubId]));
    const rows = await activitiesRepository.listByClub(clubId, isStaff);
    return canSeeMembers ? rows : rows.filter((a) => a.visibility === "university");
  },

  // ── Co-host davet/kabul ────────────────────────────────────────────────────
  /**
   * Host kulüp, başka bir kulübü (aynı ya da FARKLI üniversiteden — turnuva)
   * etkinliğe co-host davet eder. Davet `invited` doğar; hedef kulübün staff'ı
   * kabul edene kadar tenant/görünürlük/keşifte SAYILMAZ. Hedef staff'a bildirim.
   */
  async inviteCoHost(hostClubId: string, activityId: string, targetClubId: string) {
    await this.requireHostedActivity(hostClubId, activityId);
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
    await this.requireHostedActivity(hostClubId, activityId);
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
    await this.requireHostedActivity(hostClubId, activityId);
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

  /** Etkinlik var + bu kulüp onun HOST'u — değilse 404/403. Yönetim rotalarının ortak guard'ı. */
  async requireHostedActivity(hostClubId: string, activityId: string): Promise<Activity> {
    const activity = await activitiesRepository.findById(activityId);
    if (!activity) {
      throw notFound("activity.notFound");
    }
    if (!(await activitiesRepository.isHostClub(activityId, hostClubId))) {
      throw forbidden("activity.notAHostClub");
    }
    return activity;
  },

  // ═══════════════════════════════════════════════
  // KEŞİF / RSVP (tenant'taki kullanıcı)
  // ═══════════════════════════════════════════════
  /** Üniversite geneli yayınlanmış + `university` görünürlüğündeki etkinlikler. */
  async listDiscovery(universityId: string, query: ListActivitiesQueryDTO) {
    // Aramalı keşif cache'lenmez (çok anahtar, düşük değer — university.cache ile aynı ilke).
    if (query.search) {
      return await activitiesRepository.listForUniversity(universityId, query.scope, query.search);
    }
    return await activitiesCache.discovery(universityId, query.scope).read(() =>
      activitiesRepository.listForUniversity(universityId, query.scope)
    );
  },

  /**
   * Etkinlik detayı — tenant + görünürlük + yayın kuralları uygulanır, katılımcı
   * sayısı ve çağıranın kendi RSVP'si eklenir.
   */
  async getDetail(userId: string, universityId: string, activityId: string) {
    const detail = await this.resolveViewable(userId, universityId, activityId);
    const goingCount = await activitiesRepository.countGoing(activityId);
    const myRsvp = await activitiesRepository.findAttendee(activityId, userId);

    // Yalnızca kabul edilmiş bağları göster (davet bekleyen co-host henüz katılmadı).
    const hosts = detail.activityClubs.filter((ac) => ac.role === "host" && ac.status === "accepted").map((ac) => ac.club);
    const coHosts = detail.activityClubs.filter((ac) => ac.role === "co_host" && ac.status === "accepted").map((ac) => ac.club);

    return {
      ...stripJoins(detail),
      creator: detail.creator ? toSafeUser(detail.creator) : null,
      hostClub: hosts[0] ?? null,
      coHostClubs: coHosts,
      goingCount,
      myRsvp: myRsvp ? { status: myRsvp.status, checkedInAt: myRsvp.checkedInAt } : null,
    };
  },

  /**
   * Katılım bildirme (RSVP). Yayınlanmış + görünür + gelecek bir etkinlik olmalı;
   * 'going' için kapasite kontrol edilir (dolu → 400). Upsert: aynı kullanıcı
   * durumunu değiştirebilir (interested ↔ going).
   */
  async rsvp(userId: string, universityId: string, activityId: string, data: RsvpDTO) {
    const detail = await assertCanRsvp(userId, universityId, activityId);
    // `new Date(...)` sarmalaması ARTIK GEREKLİ DEĞİL: varsayılan cache codec'i
    // (core/cache richCodec) Date'i Date olarak geri getiriyor. Savunma amaçlı
    // bırakıldı — Date'i de string'i de kabul eder, maliyeti yok.
    if (new Date(detail.startsAt).getTime() < Date.now()) {
      throw badRequest("activity.pastCannotRsvp");
    }

    const row = await activitiesRepository.upsertAttendeeWithCapacity(
      activityId,
      userId,
      data.status,
      detail.capacity
    );
    if (!row) {
      throw badRequest("activity.full");
    }
    return { status: row.status };
  },

  /** Katılımı geri alma (idempotent — yoksa da başarı döner). */
  async cancelRsvp(userId: string, activityId: string) {
    await activitiesRepository.removeAttendee(activityId, userId);
  },

  /** "Etkinliklerim": kullanıcının RSVP'leri, etkinlik + host kulübü gömülü. */
  async listMine(userId: string) {
    const rows = await activitiesRepository.listByUser(userId);
    return rows
      .filter((r) => r.activity)
      .map((r) => {
        const host = r.activity!.activityClubs.find((ac) => ac.role === "host")?.club ?? null;
        return {
          status: r.status,
          checkedInAt: r.checkedInAt,
          activity: { ...stripJoins(r.activity!), hostClub: host },
        };
      });
  },

  /**
   * Detayı getirir ve GÖRÜNÜRLÜK/TENANT/YAYIN kurallarını uygular; geçerse detayı
   * döner. Tenant sızıntısı olmasın diye tenant-dışı etkinlik "bulunamadı" gibi görünür.
   */
  async resolveViewable(userId: string, universityId: string, activityId: string) {
    return await assertCanRsvp(userId, universityId, activityId);
  },

  /** Staff ekranında gösterilen dönen yoklama QR token'ı. */
  async getCheckInQr(hostClubId: string, activityId: string) {
    const activity = await this.requireHostedActivity(hostClubId, activityId);
    assertCheckInWindow(activity.startsAt, activity.endsAt);
    return await checkInQrCache.getOrRotate(activityId);
  },

  /**
   * Öğrenci kendi yoklamasını QR ile işaretler — RSVP + görünürlük kapısı,
   * kısa ömürlü token doğrulaması; zaten işaretliyse no-op.
   */
  async selfCheckIn(userId: string, universityId: string, activityId: string, token: string) {
    const detail = await assertCanRsvp(userId, universityId, activityId);
    assertCheckInWindow(detail.startsAt, detail.endsAt);

    const attendee = await activitiesRepository.findAttendee(activityId, userId);
    if (!attendee) {
      throw forbidden("attendee.notAttendee");
    }

    const valid = await checkInQrCache.validate(activityId, token);
    if (!valid) {
      throw badRequest("activity.checkInTokenInvalid");
    }

    if (attendee.checkedInAt) {
      return attendee;
    }

    return await activitiesRepository.setCheckIn(activityId, userId, new Date());
  },
};

// ── yardımcılar ────────────────────────────────────────────────────────────

/** Zaman penceresi doğrulaması (oluşturma/güncellemede ortak). */
function assertValidWindow(startsAt: Date, endsAt: Date | null | undefined) {
  if (startsAt.getTime() < Date.now()) {
    throw badRequest("activity.startInPast");
  }
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw badRequest("activity.endBeforeStart");
  }
}

/** Yoklama QR penceresi: başlangıçtan 30 dk önce — bitiş + 30 dk (bitiş yoksa +2h varsayım). */
const CHECK_IN_WINDOW_BEFORE_MS = 30 * 60 * 1000;
const CHECK_IN_WINDOW_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

function assertCheckInWindow(startsAt: Date, endsAt: Date | null) {
  const now = Date.now();
  const openAt = startsAt.getTime() - CHECK_IN_WINDOW_BEFORE_MS;
  const eventEnd = endsAt ?? new Date(startsAt.getTime() + DEFAULT_EVENT_DURATION_MS);
  const closeAt = eventEnd.getTime() + CHECK_IN_WINDOW_AFTER_MS;
  if (now < openAt) {
    throw badRequest("activity.checkInNotOpen");
  }
  if (now > closeAt) {
    throw badRequest("activity.checkInClosed");
  }
}

/** İlişki alanlarını (activityClubs/creator) atıp düz etkinlik satırını döndürür. */
function stripJoins<T extends { activityClubs?: unknown; creator?: unknown }>(row: T): Omit<T, "activityClubs" | "creator"> {
  const { activityClubs: _ac, creator: _c, ...rest } = row;
  return rest;
}

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
