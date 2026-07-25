import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { announcementsRepository } from "./announcements.repository";

/**
 * announcements feature'ının cache sözleşmesi (`announcements:` keyspace'i).
 * Kulüp duyuru listesi okuma-yoğun + görece durağandır → read-through cache'lenir.
 *
 * ÇAPRAZ-FEATURE: admin moderasyonu (moderateRemoveAnnouncement) bir duyuruyu
 * silebilir → o yol da `announcementEffects.changed.emit(clubId)` çağırır. Efektin
 * TANIMI burada, tek yerde durur.
 */
type AnnouncementList = Awaited<ReturnType<typeof announcementsRepository.findByClub>>;

export const announcementsCache = defineKeyspace(cache, "announcements", {
  /** Bir kulübün duyuru listesi (ham satırlar; yazar şekillendirmesi serviste). */
  list: entry<AnnouncementList>()((clubId: string) => `list:${clubId}`),
});

export const announcementEffects = {
  /** Duyuru eklendi/silindi (moderasyon dahil) → o kulübün listesi. */
  changed: effect("announcements.changed", (clubId: string) => [announcementsCache.list(clubId)]),
};
