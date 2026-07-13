import { cache } from "../../shared/cache/cache.client";

/**
 * gallery feature'ının izole cache keyspace'i (`gallery:` öneki). Kulüp galeri
 * listesi okuma-yoğun + görece durağandır → read-through cache'lenir.
 *
 * ÇAPRAZ-FEATURE: admin moderasyonu (moderateRemoveGalleryImage) bir görseli
 * silebilir → o yol da `invalidate(clubId)` çağırır.
 */
const c = cache.namespace("gallery");

const listKey = (clubId: string) => `list:${clubId}`;

export const galleryCache = {
  list: <T>(clubId: string, loader: () => Promise<T>) => c.getOrSet(listKey(clubId), loader),
  /** Görsel eklendi/silindi (moderasyon dahil) → o kulübün listesi. */
  invalidate: (clubId: string) => c.delete(listKey(clubId)),
};
