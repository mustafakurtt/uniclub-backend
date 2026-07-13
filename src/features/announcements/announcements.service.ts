import { announcementsRepository } from "./announcements.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { CreateAnnouncementDTO } from "./announcements.schema";
import { notFound } from "../../shared/utils/errors";
import { announcementsCache } from "./announcements.cache";

export const announcementsService = {
  async listByClub(clubId: string) {
    // Yazar bilgisi cache'lenen ham satırdan sonra toSafeUser ile şekillenir.
    const announcements = await announcementsCache.list(clubId, () =>
      announcementsRepository.findByClub(clubId)
    );
    return announcements
      .filter((a) => a.author)
      .map((a) => ({ ...a, author: toSafeUser(a.author!) }));
  },

  async create(universityId: string, clubId: string, authorId: string, data: CreateAnnouncementDTO) {
    const result = await announcementsRepository.add(universityId, clubId, authorId, data);
    await announcementsCache.invalidate(clubId);
    return result;
  },

  async remove(clubId: string, announcementId: string) {
    const existing = await announcementsRepository.findInClub(clubId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }
    await announcementsRepository.removeFromClub(clubId, announcementId);
    await announcementsCache.invalidate(clubId);
  },
};
