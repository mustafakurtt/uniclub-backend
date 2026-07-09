import { announcementsRepository } from "./announcements.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { CreateAnnouncementDTO } from "./announcements.schema";

export const announcementsService = {
  async listByClub(clubId: string) {
    const announcements = await announcementsRepository.findByClub(clubId);
    return announcements
      .filter((a) => a.author)
      .map((a) => ({ ...a, author: toSafeUser(a.author!) }));
  },

  async create(universityId: string, clubId: string, authorId: string, data: CreateAnnouncementDTO) {
    return await announcementsRepository.create(universityId, clubId, authorId, data);
  },

  async remove(clubId: string, announcementId: string) {
    const existing = await announcementsRepository.findById(clubId, announcementId);
    if (!existing) {
      throw new Error("Duyuru bulunamadı.");
    }
    await announcementsRepository.deleteById(clubId, announcementId);
  },
};
