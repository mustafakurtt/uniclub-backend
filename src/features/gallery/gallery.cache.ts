import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { galleryRepository } from "./gallery.repository";

/**
 * gallery feature'ının cache sözleşmesi (`gallery:` keyspace'i). Kulüp galeri
 * listesi okuma-yoğun + görece durağandır → read-through cache'lenir.
 *
 * ÇAPRAZ-FEATURE: admin moderasyonu (moderateRemoveGalleryImage) bir görseli
 * silebilir → o yol da `galleryEffects.changed.emit(clubId)` çağırır.
 */
type GalleryList = Awaited<ReturnType<typeof galleryRepository.findByClub>>;

export const galleryCache = defineKeyspace(cache, "gallery", {
  /** Bir kulübün galeri listesi (ham satırlar; yükleyen şekillendirmesi serviste). */
  list: entry<GalleryList>()((clubId: string) => `list:${clubId}`),
});

export const galleryEffects = {
  /** Görsel eklendi/silindi (moderasyon dahil) → o kulübün listesi. */
  changed: effect("gallery.changed", (clubId: string) => [galleryCache.list(clubId)]),
};
