import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { announcements, clubAdvisors, clubMembers } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import type { CreateAnnouncementPayload } from "./announcements.types";

const STAFF_ROLES = ["officer", "president"] as const;

/**
 * Duyuru veri erişimi. Kulübe bağlı bir alt kaynak (hard-delete). BaseRepository'den
 * mekanik CRUD + composite-where helper'larını miras alır.
 */
class AnnouncementsRepository extends BaseRepository<typeof announcements, typeof db.query.announcements> {
  constructor() {
    super(db, announcements, { query: db.query.announcements });
  }

  /** Kulüp staff listesi — taslaklar dahil; sabitlenen üstte. */
  findByClubForStaff(clubId: string) {
    return db.query.announcements.findMany({
      where: { clubId },
      orderBy: (ann, { desc }) => [desc(ann.pinned), desc(ann.publishedAt), desc(ann.createdAt)],
      with: { author: true },
    });
  }

  /** Yalnızca yayınlanmış duyurular — kulüp akışı (üye/ziyaretçi). */
  findPublishedByClub(clubId: string) {
    return db.query.announcements.findMany({
      where: { clubId, status: "published" },
      orderBy: (ann, { desc }) => [desc(ann.pinned), desc(ann.publishedAt)],
      with: { author: true },
    });
  }

  /** Duyuruyu kulüp kapsamında getirir (sahiplik/varlık kontrolü). */
  findInClub(clubId: string, announcementId: string) {
    return this.findOne({ id: announcementId, clubId });
  }

  add(
    universityId: string,
    clubId: string,
    authorId: string,
    data: CreateAnnouncementPayload
  ) {
    const now = data.publish ? new Date() : null;
    return this.create({
      universityId,
      clubId,
      authorId,
      title: data.title,
      content: data.content,
      status: data.publish ? "published" : "draft",
      publishedAt: now,
      pinned: data.pinned,
      visibility: data.visibility,
    });
  }

  publishAnnouncement(announcementId: string) {
    return db
      .update(announcements)
      .set({
        status: "published",
        publishedAt: sql`COALESCE(${announcements.publishedAt}, NOW())`,
        updatedAt: new Date(),
      })
      .where(and(eq(announcements.id, announcementId), eq(announcements.status, "draft")))
      .returning();
  }

  updateInClub(clubId: string, announcementId: string, data: { pinned?: boolean; visibility?: "university" | "members" }) {
    const patch: Partial<typeof announcements.$inferInsert> = { updatedAt: new Date() };
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    return db
      .update(announcements)
      .set(patch)
      .where(and(eq(announcements.id, announcementId), eq(announcements.clubId, clubId)))
      .returning();
  }

  countPinnedInClub(clubId: string) {
    return db
      .select({ v: sql<number>`cast(count(*) as int)` })
      .from(announcements)
      .where(and(eq(announcements.clubId, clubId), eq(announcements.pinned, true)))
      .then((rows) => rows[0]?.v ?? 0);
  }

  async getApprovedMemberIds(clubId: string): Promise<string[]> {
    const rows = await db.query.clubMembers.findMany({
      where: { clubId, status: "approved" },
      columns: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async isApprovedMember(clubId: string, userId: string): Promise<boolean> {
    const row = await db.query.clubMembers.findFirst({
      where: { clubId, userId, status: "approved" },
      columns: { userId: true },
    });
    return !!row;
  }

  /** Kulüp staff (officer/president veya danışman) — taslak görünürlüğü. */
  async isClubStaff(clubId: string, userId: string): Promise<boolean> {
    const membership = await db.query.clubMembers.findFirst({
      where: { clubId, userId, status: "approved" },
      columns: { role: true },
    });
    if (membership && STAFF_ROLES.includes(membership.role as typeof STAFF_ROLES[number])) {
      return true;
    }
    const advisor = await db.query.clubAdvisors.findFirst({
      where: { clubId, userId },
      columns: { userId: true },
    });
    return !!advisor;
  }

  removeFromClub(clubId: string, announcementId: string) {
    return this.deleteWhere({ id: announcementId, clubId });
  }
}

export const announcementsRepository = new AnnouncementsRepository();
