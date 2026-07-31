import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { announcementsRepository } from "./announcements.repository";

/**
 * announcements feature'ının cache sözleşmesi (`announcements:` keyspace'i).
 * Staff ve yayınlanmış listeler ayrı anahtarlarda — taslaklar public cache'e sızmasın.
 */
type StaffAnnouncementList = Awaited<ReturnType<typeof announcementsRepository.findByClubForStaff>>;
type PublishedAnnouncementList = Awaited<ReturnType<typeof announcementsRepository.findPublishedByClub>>;
type UniversityStaffAnnouncementList = Awaited<
  ReturnType<typeof announcementsRepository.findByUniversityForStaff>
>;
type UniversityPublishedAnnouncementList = Awaited<
  ReturnType<typeof announcementsRepository.findPublishedByUniversity>
>;

export const announcementsCache = defineKeyspace(cache, "announcements", {
  staffList: entry<StaffAnnouncementList>()((clubId: string) => `staffList:${clubId}`),
  publishedList: entry<PublishedAnnouncementList>()((clubId: string) => `publishedList:${clubId}`),
  universityStaffList: entry<UniversityStaffAnnouncementList>()(
    (universityId: string) => `uniStaffList:${universityId}`
  ),
  universityPublishedList: entry<UniversityPublishedAnnouncementList>()(
    (universityId: string) => `uniPublishedList:${universityId}`
  ),
});

export const announcementEffects = {
  /** Duyuru eklendi/güncellendi/silindi (moderasyon dahil) → her iki liste. */
  changed: effect("announcements.changed", (clubId: string) => [
    announcementsCache.staffList(clubId),
    announcementsCache.publishedList(clubId),
  ]),
  /** Okul geneli duyuru değişti. */
  universityChanged: effect("announcements.universityChanged", (universityId: string) => [
    announcementsCache.universityStaffList(universityId),
    announcementsCache.universityPublishedList(universityId),
  ]),
};
