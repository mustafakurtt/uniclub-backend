import { and, eq, inArray, or, sql, desc } from "drizzle-orm";
import { db } from "../../db";
import { posterQrCodes, posterQrScans, activityClubs } from "../../db/schema";
import type {
  PosterQrCodeAnalytics,
  PosterQrOverviewAnalytics,
  PosterQrTargetSourceComparison,
} from "./poster-qr-analytics.types";

type CodeRow = typeof posterQrCodes.$inferSelect;

async function hostedActivityIds(clubId: string): Promise<string[]> {
  const hosted = await db
    .select({ activityId: activityClubs.activityId })
    .from(activityClubs)
    .where(and(eq(activityClubs.clubId, clubId), eq(activityClubs.role, "host")));
  return hosted.map((h) => h.activityId);
}

function clubTargetFilter(clubId: string, hostedIds: string[]) {
  return hostedIds.length > 0
    ? or(eq(posterQrCodes.targetClubId, clubId), inArray(posterQrCodes.targetActivityId, hostedIds))
    : eq(posterQrCodes.targetClubId, clubId);
}

async function scanDistributionByDay(qrCodeId: string, timezone: string) {
  const rows = await db.execute<{ day: string; count: number }>(sql`
    SELECT (scanned_at AT TIME ZONE ${timezone})::date::text AS day, count(*)::int AS count
    FROM poster_qr_scans
    WHERE qr_code_id = ${qrCodeId}
    GROUP BY day
    ORDER BY day
  `);
  return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}

async function scanDistributionByHour(qrCodeId: string, timezone: string) {
  const rows = await db.execute<{ hour: number; count: number }>(sql`
    SELECT extract(hour FROM scanned_at AT TIME ZONE ${timezone})::int AS hour, count(*)::int AS count
    FROM poster_qr_scans
    WHERE qr_code_id = ${qrCodeId}
    GROUP BY hour
    ORDER BY hour
  `);
  return rows.map((r) => ({ hour: Number(r.hour), count: Number(r.count) }));
}

function groupByTarget(rows: CodeRow[]): PosterQrTargetSourceComparison[] {
  const map = new Map<string, PosterQrTargetSourceComparison>();

  for (const row of rows) {
    const key = `${row.targetType}:${row.targetClubId ?? ""}:${row.targetActivityId ?? ""}`;
    let group = map.get(key);
    if (!group) {
      group = {
        targetType: row.targetType,
        targetClubId: row.targetClubId,
        targetActivityId: row.targetActivityId,
        totalScans: 0,
        sources: [],
      };
      map.set(key, group);
    }
    group.totalScans += row.scanCount;
    group.sources.push({
      qrId: row.id,
      sourceLabel: row.sourceLabel,
      scanCount: row.scanCount,
      status: row.status,
    });
  }

  return Array.from(map.values()).map((g) => ({
    ...g,
    sources: g.sources.sort((a, b) => b.scanCount - a.scanCount),
  }));
}

export const posterQrAnalyticsRepository = {
  findUniversityTimezone(universityId: string) {
    return db.query.universities.findFirst({
      where: { id: universityId },
      columns: { timezone: true },
    });
  },

  async listCodesForClub(clubId: string) {
    const hostedIds = await hostedActivityIds(clubId);
    return db
      .select()
      .from(posterQrCodes)
      .where(clubTargetFilter(clubId, hostedIds))
      .orderBy(desc(posterQrCodes.createdAt));
  },

  listCodesForUniversity(universityId: string) {
    return db
      .select()
      .from(posterQrCodes)
      .where(eq(posterQrCodes.universityId, universityId))
      .orderBy(desc(posterQrCodes.createdAt));
  },

  findCodeById(qrId: string) {
    return db.query.posterQrCodes.findFirst({ where: { id: qrId } });
  },

  async buildCodeAnalytics(row: CodeRow, timezone: string): Promise<PosterQrCodeAnalytics> {
    const [byDay, byHour] = await Promise.all([
      scanDistributionByDay(row.id, timezone),
      scanDistributionByHour(row.id, timezone),
    ]);

    return {
      qrId: row.id,
      sourceLabel: row.sourceLabel,
      targetType: row.targetType,
      targetClubId: row.targetClubId,
      targetActivityId: row.targetActivityId,
      totalScans: row.scanCount,
      byDay,
      byHour,
    };
  },

  async buildOverviewAnalytics(rows: CodeRow[], timezone: string): Promise<PosterQrOverviewAnalytics> {
    return {
      timezone,
      targets: groupByTarget(rows),
    };
  },
};
