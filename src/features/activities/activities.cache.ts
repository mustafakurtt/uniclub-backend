import { cache } from "../../shared/cache/cache.client";

/**
 * activities feature'ının izole cache keyspace'i (`activities:` öneki).
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
 * ÇAPRAZ-FEATURE: admin moderasyonu (moderateCancel) de `invalidateActivity` çağırır.
 */
const c = cache.namespace("activities");

const SCOPES = ["upcoming", "past", "all"] as const;
const detailKey = (activityId: string) => `detail:${activityId}`;
const discoveryKey = (universityId: string, scope: string) => `discovery:${universityId}:${scope}`;

/** Bir üniversitenin tüm scope keşif anahtarları (etkinlik değişince hepsi düşer). */
const discoveryKeysFor = (universityIds: string[]) =>
  universityIds.flatMap((u) => SCOPES.map((s) => discoveryKey(u, s)));

export const activitiesCache = {
  // ── Okuma (read-through) ────────────────────────────────────────────────
  detail: <T>(activityId: string, loader: () => Promise<T>) => c.getOrSet(detailKey(activityId), loader),
  discovery: <T>(universityId: string, scope: string, loader: () => Promise<T>) =>
    c.getOrSet(discoveryKey(universityId, scope), loader),

  // ── Invalidasyon ────────────────────────────────────────────────────────
  /**
   * Bir etkinlik değişti (oluştur/yayınla/güncelle/iptal/co-host/moderasyon) →
   * o etkinliğin detayı + etkilenen üniversitelerin keşif listeleri düşer.
   */
  invalidateActivity: (activityId: string, universityIds: string[]) =>
    c.delete([detailKey(activityId), ...discoveryKeysFor(universityIds)]),
};
