import { and, eq, gte, lt, desc, inArray, sql, getTableColumns, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  clubs,
  clubMembers,
  announcements,
  activities,
  activityClubs,
  activityAttendees,
  clubApplications,
  users,
} from "../../db/schema";

/**
 * dashboard bir OKUMA MODELİdir (read model): tek bir feature'a ait olmayan,
 * clubs/announcements/activities/üyelik/başvuru tablolarını birleştiren salt-okuma
 * sorgularını TEK yerde toplar. Yazma yapmaz. Diğer feature'ların repository'lerini
 * değil doğrudan tabloları okur (aggregate/count'lar feature sınırına sığmadığı için).
 */

/** count(*) yardımcı — verilen tablo/filtre için tam sayı sayaç. */
async function countWhere(table: any, where: SQL): Promise<number> {
  const [row] = await db.select({ v: sql<number>`cast(count(*) as int)` }).from(table).where(where);
  return row?.v ?? 0;
}

export const dashboardRepository = {
  // ═══════════════════════════════════════════════
  // ORTAK
  // ═══════════════════════════════════════════════
  /** Kullanıcının ONAYLI üye olduğu kulüp id'leri (feed + özet kaynağı). */
  async approvedClubIds(userId: string): Promise<string[]> {
    const rows = await db.query.clubMembers.findMany({
      where: { userId, status: "approved" },
      columns: { clubId: true },
    });
    return rows.map((r) => r.clubId);
  },

  // ═══════════════════════════════════════════════
  // ÖĞRENCİ FEED (kulüplerimden yeni içerik)
  // ═══════════════════════════════════════════════
  /** Kulüplerimin duyuruları (en yeni), keyset cursor (createdAt < cursor). */
  feedAnnouncements(clubIds: string[], cursor: Date | undefined, limit: number) {
    return db.query.announcements.findMany({
      where: {
        clubId: { in: clubIds },
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      with: { club: true },
      orderBy: { createdAt: "desc" },
      limit,
    });
  },

  /**
   * Kulüplerimin YAYINLANMIŞ etkinlikleri (en yeni yayınlanan), host kulübüyle.
   * activity_clubs (accepted) üzerinden; co-hosted etkinlik tek satır (distinct).
   */
  async feedActivities(clubIds: string[], cursor: Date | undefined, limit: number) {
    const filters: SQL[] = [
      inArray(activityClubs.clubId, clubIds),
      eq(activityClubs.status, "accepted"),
      eq(activities.status, "published"),
    ];
    if (cursor) filters.push(lt(activities.createdAt, cursor));

    const rows = await db
      .selectDistinct(getTableColumns(activities))
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .where(and(...filters))
      .orderBy(desc(activities.createdAt))
      .limit(limit);

    if (rows.length === 0) return [] as { activity: (typeof rows)[number]; hostClub: any }[];

    // Host kulüpleri tek sorguda ekle (N+1 yok).
    const hostRows = await db.query.activityClubs.findMany({
      where: { activityId: { in: rows.map((r) => r.id) }, role: "host" },
      with: { club: true },
    });
    const hostByActivity = new Map(hostRows.map((h) => [h.activityId, h.club]));
    return rows.map((a) => ({ activity: a, hostClub: hostByActivity.get(a.id) ?? null }));
  },

  // ═══════════════════════════════════════════════
  // ÖĞRENCİ ÖZETİ
  // ═══════════════════════════════════════════════
  countApprovedMemberships(userId: string) {
    return countWhere(clubMembers, and(eq(clubMembers.userId, userId), eq(clubMembers.status, "approved"))!);
  },

  countPendingMemberships(userId: string) {
    return countWhere(clubMembers, and(eq(clubMembers.userId, userId), eq(clubMembers.status, "pending"))!);
  },

  countPendingApplications(userId: string) {
    return countWhere(
      clubApplications,
      and(eq(clubApplications.applicantId, userId), eq(clubApplications.status, "pending"))!
    );
  },

  /** Katılım bildirdiğim YAKLAŞAN (published, startsAt≥now) etkinlik sayısı. */
  async countUpcomingAttending(userId: string): Promise<number> {
    const [row] = await db
      .select({ v: sql<number>`cast(count(*) as int)` })
      .from(activityAttendees)
      .innerJoin(activities, eq(activities.id, activityAttendees.activityId))
      .where(
        and(
          eq(activityAttendees.userId, userId),
          eq(activities.status, "published"),
          gte(activities.startsAt, new Date())
        )
      );
    return row?.v ?? 0;
  },

  /** En yakın katılacağım etkinlik (host kulübüyle) — özet kartı. */
  async nextAttending(userId: string) {
    const [row] = await db
      .select(getTableColumns(activities))
      .from(activityAttendees)
      .innerJoin(activities, eq(activities.id, activityAttendees.activityId))
      .where(
        and(
          eq(activityAttendees.userId, userId),
          eq(activities.status, "published"),
          gte(activities.startsAt, new Date())
        )
      )
      .orderBy(sql`${activities.startsAt} asc`)
      .limit(1);
    if (!row) return null;
    const host = await db.query.activityClubs.findFirst({
      where: { activityId: row.id, role: "host" },
      with: { club: true },
    });
    return { ...row, hostClub: host?.club ?? null };
  },

  // ═══════════════════════════════════════════════
  // KULÜP PANELİ (staff)
  // ═══════════════════════════════════════════════
  countApprovedMembers(clubId: string) {
    return countWhere(clubMembers, and(eq(clubMembers.clubId, clubId), eq(clubMembers.status, "approved"))!);
  },

  countPendingRequests(clubId: string) {
    return countWhere(clubMembers, and(eq(clubMembers.clubId, clubId), eq(clubMembers.status, "pending"))!);
  },

  countClubAnnouncements(clubId: string) {
    return countWhere(announcements, eq(announcements.clubId, clubId));
  },

  /** Kulübün yaklaşan yayınlanmış etkinlik sayısı (host ya da accepted co-host). */
  async countClubUpcomingActivities(clubId: string): Promise<number> {
    const [row] = await db
      .select({ v: sql<number>`cast(count(distinct ${activities.id}) as int)` })
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .where(
        and(
          eq(activityClubs.clubId, clubId),
          eq(activityClubs.status, "accepted"),
          eq(activities.status, "published"),
          gte(activities.startsAt, new Date())
        )
      );
    return row?.v ?? 0;
  },

  // ═══════════════════════════════════════════════
  // ADMIN ÖZETİ (tenant geneli)
  // ═══════════════════════════════════════════════
  /** Bir tabloda `statusCol`'a göre grup sayacı → { status: count } haritası. */
  async statusBreakdown(table: any, statusCol: any, tenantFilter: SQL): Promise<Record<string, number>> {
    const rows = await db
      .select({ status: statusCol, v: sql<number>`cast(count(*) as int)` })
      .from(table)
      .where(tenantFilter)
      .groupBy(statusCol);
    return Object.fromEntries(rows.map((r: any) => [r.status, r.v]));
  },

  clubStatusCounts(universityId: string) {
    return this.statusBreakdown(clubs, clubs.status, eq(clubs.universityId, universityId));
  },

  userStatusCounts(universityId: string) {
    return this.statusBreakdown(users, users.status, eq(users.universityId, universityId));
  },

  countTenantPendingApplications(universityId: string) {
    return countWhere(
      clubApplications,
      and(eq(clubApplications.universityId, universityId), eq(clubApplications.status, "pending"))!
    );
  },

  /** Tenant'taki yaklaşan yayınlanmış etkinlik sayısı (accepted kulüp bağı üzerinden). */
  async countTenantUpcomingActivities(universityId: string): Promise<number> {
    const [row] = await db
      .select({ v: sql<number>`cast(count(distinct ${activities.id}) as int)` })
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .where(
        and(
          eq(clubs.universityId, universityId),
          eq(activityClubs.status, "accepted"),
          eq(activities.status, "published"),
          gte(activities.startsAt, new Date())
        )
      );
    return row?.v ?? 0;
  },
};
