import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { CreateAnnouncementPayload } from "./announcements.types";

export const announcementsRepository = {
  async findByClub(clubId: string) {
    return await db.query.announcements.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      with: { author: true },
    });
  },

  async findById(clubId: string, announcementId: string) {
    return await db.query.announcements.findFirst({
      where: { id: announcementId, clubId },
    });
  },

  async create(universityId: string, clubId: string, authorId: string, data: CreateAnnouncementPayload) {
    const [inserted] = await db.insert(schema.announcements).values({
      universityId,
      clubId,
      authorId,
      title: data.title,
      content: data.content,
    }).returning();
    return inserted;
  },

  async deleteById(clubId: string, announcementId: string) {
    await db.delete(schema.announcements).where(
      and(eq(schema.announcements.id, announcementId), eq(schema.announcements.clubId, clubId))
    );
  },
};
