import { activitiesRepository } from "./activities.repository";
import { activitiesCache } from "./activities.cache";
import { ListActivitiesQueryDTO } from "./activities.schema";
import { socialPreviewService } from "../social-preview/social-preview.service";
import {
  assertCanRsvp,
  stripJoins,
  toSafeUser,
} from "./activities-guards.util";

/** Tenant keşif listesi, detay ve "etkinliklerim" — görünürlük kapıları uygulanır. */
export const activitiesDiscoveryService = {
  /** Üniversite geneli yayınlanmış + `university` görünürlüğündeki etkinlikler. */
  async listDiscovery(universityId: string, query: ListActivitiesQueryDTO) {
    let rows;
    // Aramalı keşif cache'lenmez (çok anahtar, düşük değer — university.cache ile aynı ilke).
    if (query.search) {
      rows = await activitiesRepository.listForUniversity(universityId, query.scope, query.search);
    } else {
      rows = await activitiesCache.discovery(universityId, query.scope).read(() =>
        activitiesRepository.listForUniversity(universityId, query.scope)
      );
    }

    if (!(await socialPreviewService.isEnabled(universityId))) {
      return rows;
    }

    const stats = await socialPreviewService.loadForActivities(universityId, rows.map((a) => a.id));
    return socialPreviewService.attachActivitySocial(rows, stats);
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
};
