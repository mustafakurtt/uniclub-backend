import { announcementsRepository } from "./announcements.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { CreateAnnouncementDTO } from "./announcements.schema";
import { notFound } from "../../shared/utils/errors";

export const announcementsService = {
  async listByClub(clubId: string) {
    const announcements = await announcementsRepository.findByClub(clubId);
    return announcements
      .filter((a) => a.author)
      .map((a) => ({ ...a, author: toSafeUser(a.author!) }));
  },

  async create(universityId: string, clubId: string, authorId: string, data: CreateAnnouncementDTO) {
    return await announcementsRepository.add(universityId, clubId, authorId, data);
  },

  async remove(clubId: string, announcementId: string) {
    const existing = await announcementsRepository.findInClub(clubId, announcementId);
    if (!existing) {
      throw notFound("announcement.notFound");
    }
    await announcementsRepository.removeFromClub(clubId, announcementId);
  },
};
