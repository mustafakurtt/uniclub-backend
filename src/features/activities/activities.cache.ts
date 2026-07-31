import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { activitiesRepository } from "./activities.repository";

/**
 * activities feature'ının cache sözleşmesi (`activities:` keyspace'i).
 *
 * SEÇİCİ CACHE (aynı university.cache'in "arama cache'lenmez" ilkesi): yalnızca
 * VIEWER-BAĞIMSIZ ve VOLATİL-OLMAYAN okumalar cache'lenir:
 *   - `detail`   : etkinliğin taban detayı (satır + kabul edilmiş kulüpler). goingCount
 *                  ve çağıranın RSVP'si serviste CANLI eklenir → cache'e girmez.
 *   - `discovery`: üniversite geneli keşif listesi (uni + scope). `search`'lü keşif
 *                  cache'lenmez (çok anahtar, düşük değer).
 * Kulübün etkinlik LİSTESİ (listByClub) BİLİNÇLİ olarak cache'lenmez: sonucu
 * viewer'a göre değişir (staff taslak görür, üye members görür) → paylaşımlı bir
 * anahtara sığmaz.
 *
 * TETİK NEDEN SERVİSTE: `activityChanged` efektinin `universityIds` parametresi
 * DB SORGUSUNDAN gelir (`getAcceptedUniversityIds` — bir etkinlik birden çok
 * üniversitenin kulüpleri tarafından co-host edilebilir). Rota path'inde böyle bir
 * bilgi yoktur, dolayısıyla `invalidates()` middleware'i bunu türetemez.
 *
 * ÇAPRAZ-FEATURE: admin moderasyonu (moderateCancel) de aynı efekti emit eder.
 */
type ActivityDetail = Awaited<ReturnType<typeof activitiesRepository.findDetailById>>;
type ActivityDiscovery = Awaited<ReturnType<typeof activitiesRepository.listForUniversity>>;

/** Keşif listesi scope'a göre ayrı anahtarlanır; etkinlik değişince hepsi düşer. */
const SCOPES = ["upcoming", "past", "all"] as const;

export const activitiesCache = defineKeyspace(cache, "activities", {
  /** Etkinliğin viewer-bağımsız taban detayı. */
  detail: entry<ActivityDetail>()((activityId: string) => `detail:${activityId}`),
  /** Bir üniversitenin keşif listesi (scope başına ayrı anahtar). */
  discovery: entry<ActivityDiscovery>()(
    (universityId: string, scope: string) => `discovery:${universityId}:${scope}`
  ),
});

export const activityEffects = {
  /**
   * Bir etkinlik değişti (oluştur/yayınla/güncelle/iptal/co-host/moderasyon) →
   * o etkinliğin detayı + ETKİLENEN TÜM üniversitelerin keşif listeleri düşer.
   */
  activityChanged: effect(
    "activities.changed",
    (activityId: string, universityIds: string[]) => [
      activitiesCache.detail(activityId),
      ...universityIds.flatMap((u) => SCOPES.map((s) => activitiesCache.discovery(u, s))),
    ]
  ),
};
