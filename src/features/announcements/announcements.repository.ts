import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { announcements, clubAdvisors, clubMembers } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import type { CreateAnnouncementPayload, UpdateAnnouncementPayload } from "./announcements.types";

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

  /** Okul geneli duyurular — staff listesi (taslaklar dahil). */
  findByUniversityForStaff(universityId: string) {
    return db.query.announcements.findMany({
      where: { universityId, clubId: { isNull: true } },
      orderBy: (ann, { desc }) => [desc(ann.pinned), desc(ann.publishedAt), desc(ann.createdAt)],
      with: { author: true },
    });
  }

  /** Okul geneli yayınlanmış duyurular. */
  findPublishedByUniversity(universityId: string) {
    return db.query.announcements.findMany({
      where: { universityId, clubId: { isNull: true }, status: "published" },
      orderBy: (ann, { desc }) => [desc(ann.pinned), desc(ann.publishedAt)],
      with: { author: true },
    });
  }

  findInUniversity(universityId: string, announcementId: string) {
    return db.query.announcements.findFirst({
      where: { id: announcementId, universityId, clubId: { isNull: true } },
    });
  }

  findUniversityAnnouncementDetail(universityId: string, announcementId: string) {
    return db.query.announcements.findFirst({
      where: { id: announcementId, universityId, clubId: { isNull: true } },
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
    const scheduled = data.scheduledPublishAt ?? null;
    const publishNow = data.publish && !scheduled;
    const now = publishNow ? new Date() : null;
    return this.create({
      universityId,
      clubId,
      authorId,
      title: data.title,
      content: data.content,
      status: publishNow ? "published" : "draft",
      publishedAt: now,
      scheduledPublishAt: scheduled,
      pinned: data.pinned,
      visibility: data.visibility,
    });
  }

  addUniversity(
    universityId: string,
    authorId: string,
    data: {
      title: string;
      content: string;
      pinned: boolean;
      publish: boolean;
      scheduledPublishAt?: Date | null;
    }
  ) {
    const scheduled = data.scheduledPublishAt ?? null;
    const publishNow = data.publish && !scheduled;
    const now = publishNow ? new Date() : null;
    return this.create({
      universityId,
      clubId: null,
      authorId,
      title: data.title,
      content: data.content,
      status: publishNow ? "published" : "draft",
      publishedAt: now,
      scheduledPublishAt: scheduled,
      pinned: data.pinned,
      visibility: "university",
    });
  }

  publishAnnouncement(announcementId: string) {
    return db
      .update(announcements)
      .set({
        status: "published",
        publishedAt: sql`COALESCE(${announcements.publishedAt}, NOW())`,
        scheduledPublishAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(announcements.id, announcementId), eq(announcements.status, "draft")))
      .returning();
  }

  findById(announcementId: string) {
    return this.findOne({ id: announcementId });
  }

  updateInClub(clubId: string, announcementId: string, data: UpdateAnnouncementPayload) {
    const patch: Partial<typeof announcements.$inferInsert> = { updatedAt: new Date() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if (data.scheduledPublishAt !== undefined) patch.scheduledPublishAt = data.scheduledPublishAt;
    if (data.editedAt !== undefined) patch.editedAt = data.editedAt;
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

  countPinnedInUniversity(universityId: string) {
    return db
      .select({ v: sql<number>`cast(count(*) as int)` })
      .from(announcements)
      .where(
        and(
          eq(announcements.universityId, universityId),
          isNull(announcements.clubId),
          eq(announcements.pinned, true)
        )
      )
      .then((rows) => rows[0]?.v ?? 0);
  }

  async getTenantActiveUserIds(universityId: string): Promise<string[]> {
    const rows = await db.query.users.findMany({
      where: { universityId, status: "active" },
      columns: { id: true },
    });
    return rows.map((r) => r.id);
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
      where: { clubId, userId, leftAt: { isNull: true } },
      columns: { userId: true },
    });
    return !!advisor;
  }

  updateInUniversity(
    universityId: string,
    announcementId: string,
    data: {
      title?: string;
      content?: string;
      pinned?: boolean;
      scheduledPublishAt?: Date | null;
      editedAt?: Date | null;
    }
  ) {
    const patch: Partial<typeof announcements.$inferInsert> = { updatedAt: new Date() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    if (data.scheduledPublishAt !== undefined) patch.scheduledPublishAt = data.scheduledPublishAt;
    if (data.editedAt !== undefined) patch.editedAt = data.editedAt;
    return db
      .update(announcements)
      .set(patch)
      .where(
        and(
          eq(announcements.id, announcementId),
          eq(announcements.universityId, universityId),
          isNull(announcements.clubId)
        )
      )
      .returning();
  }

  removeFromClub(clubId: string, announcementId: string) {
    return this.deleteWhere({ id: announcementId, clubId });
  }

  removeFromUniversity(universityId: string, announcementId: string) {
    return db
      .delete(announcements)
      .where(
        and(
          eq(announcements.id, announcementId),
          eq(announcements.universityId, universityId),
          isNull(announcements.clubId)
        )
      );
  }

  /** Mutabakat taraması: zamanlanmış taslak duyurular. */
  findScheduledDrafts() {
    return db
      .select({
        id: announcements.id,
        scheduledPublishAt: announcements.scheduledPublishAt,
      })
      .from(announcements)
      .where(and(eq(announcements.status, "draft"), isNotNull(announcements.scheduledPublishAt)));
  }
}

export const announcementsRepository = new AnnouncementsRepository();
