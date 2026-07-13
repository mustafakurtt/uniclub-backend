import { cache } from "../../shared/cache/cache.client";

/**
 * announcements feature'ının izole cache keyspace'i (`announcements:` öneki).
 * Kulüp duyuru listesi okuma-yoğun + görece durağandır → read-through cache'lenir.
 *
 * ÇAPRAZ-FEATURE: admin moderasyonu (moderateRemoveAnnouncement) bir duyuruyu
 * silebilir → o yol da `invalidate(clubId)` çağırır.
 */
const c = cache.namespace("announcements");

const listKey = (clubId: string) => `list:${clubId}`;

export const announcementsCache = {
  list: <T>(clubId: string, loader: () => Promise<T>) => c.getOrSet(listKey(clubId), loader),
  /** Duyuru eklendi/silindi (moderasyon dahil) → o kulübün listesi. */
  invalidate: (clubId: string) => c.delete(listKey(clubId)),
};
