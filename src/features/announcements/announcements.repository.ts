import { db } from "../../db";
import { announcements } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import { CreateAnnouncementPayload } from "./announcements.types";

/**
 * Duyuru veri erişimi. Kulübe bağlı bir alt kaynak (hard-delete). BaseRepository'den
 * mekanik CRUD + composite-where helper'larını miras alır; kulüp-kapsamlı sorgular
 * `findOne`/`deleteWhere`, yazar ilişkili liste ise `this.query` ile.
 */
class AnnouncementsRepository extends BaseRepository<typeof announcements, typeof db.query.announcements> {
  constructor() {
    super(db, announcements, { query: db.query.announcements });
  }

  findByClub(clubId: string) {
    return this.query!.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      with: { author: true },
    });
  }

  /** Duyuruyu kulüp kapsamında getirir (sahiplik/varlık kontrolü). */
  findInClub(clubId: string, announcementId: string) {
    return this.findOne({ id: announcementId, clubId });
  }

  add(universityId: string, clubId: string, authorId: string, data: CreateAnnouncementPayload) {
    return this.create({
      universityId,
      clubId,
      authorId,
      title: data.title,
      content: data.content,
    });
  }

  removeFromClub(clubId: string, announcementId: string) {
    return this.deleteWhere({ id: announcementId, clubId });
  }
}

export const announcementsRepository = new AnnouncementsRepository();
