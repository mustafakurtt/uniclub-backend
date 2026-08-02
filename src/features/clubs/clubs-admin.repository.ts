import { eq, and, lt, desc, sql, getTableColumns, type SQL } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import {
  clubs,
  clubMembers,
  clubAdvisors,
  announcements,
  clubGallery,
  activities,
  activityClubs,
  users,
} from "../../db/schema";
import { BaseRepository } from "../../core/db";
import type { Club, UpdateClubPayload } from "./clubs.types";

/**
 * admin cross-tenant moderasyon aggregate'i tek bir sahip tabloya oturmaz. Ama
 * `id` taşıyan tablolara tenant-kapsamlı okuma/yazma (`{ id, universityId }`)
 * tekrar eden bir boilerplate'tir — bunları core composite-where helper'larıyla
 * sadeleştirmek için tablo başına hafif BaseRepository örnekleri tutulur.
 * (clubMembers/clubAdvisors BİLEŞİK anahtarlı olduğu için kapsam dışı → ham Drizzle.)
 */
const clubsRepo = new BaseRepository(db, schema.clubs);

export const clubsAdminRepository = {
  async findClubsByUniversity(universityId: string, status?: Club["status"]) {
    return await db.query.clubs.findMany({
      where: { universityId, ...(status ? { status } : {}) },
    });
  },

  async findClubInUniversity(universityId: string, clubId: string) {
    return await clubsRepo.findOne({ id: clubId, universityId });
  },

  /** Kulüp + özet sayaçlar — tek sorgu, N+1 yok. */
  async findClubDetailWithCounts(universityId: string, clubId: string) {
    const [row] = await db
      .select({
        club: getTableColumns(clubs),
        memberCount: sql<number>`(
          select cast(count(*) as int) from ${clubMembers}
          where ${clubMembers.clubId} = ${clubId} and ${clubMembers.status} = 'approved'
        )`,
        pendingJoinRequests: sql<number>`(
          select cast(count(*) as int) from ${clubMembers}
          where ${clubMembers.clubId} = ${clubId} and ${clubMembers.status} = 'pending'
        )`,
        advisorCount: sql<number>`(
          select cast(count(*) as int) from ${clubAdvisors}
          where ${clubAdvisors.clubId} = ${clubId}
            and ${clubAdvisors.leftAt} is null
        )`,
        upcomingActivities: sql<number>`(
          select cast(count(distinct a.id) as int)
          from activities a
          inner join activity_clubs ac on ac.activity_id = a.id
          where ac.club_id = ${clubId}
            and ac.status = 'accepted'
            and a.status = 'published'
            and a.starts_at >= now()
        )`,
      })
      .from(clubs)
      .where(and(eq(clubs.id, clubId), eq(clubs.universityId, universityId)))
      .limit(1);
    if (!row) return null;
    const { club, memberCount, pendingJoinRequests, advisorCount, upcomingActivities } = row;
    return {
      club,
      memberCount,
      pendingJoinRequests,
      advisorCount,
      upcomingActivities,
    };
  },

  async listClubAnnouncementsForAdmin(clubId: string, limit: number, cursor?: Date) {
    const filters: SQL[] = [eq(announcements.clubId, clubId)];
    if (cursor) filters.push(lt(announcements.createdAt, cursor));
    const rows = await db
      .select({
        announcement: getTableColumns(announcements),
        author: getTableColumns(users),
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorId, users.id))
      .where(and(...filters))
      .orderBy(desc(announcements.createdAt))
      .limit(limit + 1);
    return rows.map((row) => ({ ...row.announcement, author: row.author }));
  },

  async listClubGalleryForAdmin(clubId: string, limit: number, cursor?: Date) {
    const filters: SQL[] = [eq(clubGallery.clubId, clubId)];
    if (cursor) filters.push(lt(clubGallery.createdAt, cursor));
    const rows = await db
      .select({
        image: getTableColumns(clubGallery),
        uploader: getTableColumns(users),
      })
      .from(clubGallery)
      .innerJoin(users, eq(clubGallery.uploadedBy, users.id))
      .where(and(...filters))
      .orderBy(desc(clubGallery.createdAt))
      .limit(limit + 1);
    return rows.map((row) => ({ ...row.image, uploader: row.uploader }));
  },

  listClubActivitiesForAdmin(clubId: string, limit: number, cursor?: Date) {
    const filters: SQL[] = [
      eq(activityClubs.clubId, clubId),
      eq(activityClubs.status, "accepted"),
    ];
    if (cursor) filters.push(lt(activities.startsAt, cursor));
    return db
      .select(getTableColumns(activities))
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .where(and(...filters))
      .orderBy(desc(activities.startsAt))
      .limit(limit + 1);
  },

  async updateClubStatus(universityId: string, clubId: string, status: Club["status"]): Promise<Club | undefined> {
    const [updated] = await clubsRepo.updateWhere({ id: clubId, universityId }, { status });
    return updated;
  },

  async updateClub(universityId: string, clubId: string, data: UpdateClubPayload): Promise<Club | undefined> {
    const [updated] = await clubsRepo.updateWhere({ id: clubId, universityId }, data);
    return updated;
  },

  /**
   * Kulübü ve ona bağlı tüm içeriği tek transaction'da siler. Silme sırası FK
   * bağımlılıklarına göredir: önce yaprak kayıtlar (duyuru/galeri/link/üyelik/
   * danışmanlık), en son kulübün kendisi. Başvurular (clubApplications) kulübe FK
   * ile bağlı DEĞİLDİR (ayrı yaşam döngüsü), o yüzden dokunulmaz.
   */
  async deleteClub(universityId: string, clubId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(schema.announcements).where(eq(schema.announcements.clubId, clubId));
      await tx.delete(schema.clubGallery).where(eq(schema.clubGallery.clubId, clubId));
      await tx.delete(schema.clubContactLinks).where(eq(schema.clubContactLinks.clubId, clubId));
      await tx.delete(schema.clubMembers).where(eq(schema.clubMembers.clubId, clubId));
      await tx.delete(schema.clubAdvisors).where(eq(schema.clubAdvisors.clubId, clubId));
      await tx.delete(schema.clubs).where(
        and(eq(schema.clubs.id, clubId), eq(schema.clubs.universityId, universityId))
      );
    });
  },

  async findAdvisorsByClub(clubId: string) {
    return await db.query.clubAdvisors.findMany({
      where: { clubId, leftAt: { isNull: true } },
      with: { user: true },
    });
  },

  async findAdvisor(clubId: string, userId: string) {
    return await db.query.clubAdvisors.findFirst({
      where: { clubId, userId, leftAt: { isNull: true } },
    });
  },

  // universityId zorunlu: satır hem kulübe hem danışmana BİLEŞİK FK ile bağlı —
  // "başka okulun hocasını danışman yapma" artık DB'de de imkânsız
  // (servis katmanındaki kontrolün ikizi, bkz. clubsAdminService.inviteAdvisor).
  async addAdvisor(clubId: string, userId: string, universityId: string) {
    const [inserted] = await db
      .insert(schema.clubAdvisors)
      .values({ clubId, userId, universityId })
      .returning();
    return inserted;
  },

  async removeAdvisor(clubId: string, userId: string) {
    await db.delete(schema.clubAdvisors).where(
      and(eq(schema.clubAdvisors.clubId, clubId), eq(schema.clubAdvisors.userId, userId))
    );
  },

  // ═══════════════════════════════════════════════
  // TENANT MODERASYON (bkz. docs/design/06 §A6)
  // ═══════════════════════════════════════════════
  async findMembersByClub(clubId: string) {
    return await db.query.clubMembers.findMany({
      where: { clubId },
      with: { user: true },
    });
  },

  async findClubMember(clubId: string, userId: string) {
    return await db.query.clubMembers.findFirst({
      where: { clubId, userId },
    });
  },

  async removeClubMember(clubId: string, userId: string) {
    await db.delete(schema.clubMembers).where(
      and(eq(schema.clubMembers.clubId, clubId), eq(schema.clubMembers.userId, userId))
    );
  },

  async findAnnouncementInClub(clubId: string, announcementId: string) {
    return await db.query.announcements.findFirst({
      where: { id: announcementId, clubId },
    });
  },

  async deleteAnnouncement(announcementId: string) {
    await db.delete(schema.announcements).where(eq(schema.announcements.id, announcementId));
  },

  async findGalleryImageInClub(clubId: string, imageId: string) {
    return await db.query.clubGallery.findFirst({
      where: { id: imageId, clubId },
    });
  },

  async deleteGalleryImage(imageId: string) {
    await db.delete(schema.clubGallery).where(eq(schema.clubGallery.id, imageId));
  },
};
