import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clubs, clubApplications, universityDomains, users } from "../../../db/schema";

/**
 * Platform tenant read-model agregasyonları — salt-okunur, çapraz-tenant özetler.
 * Tablo yazımı bu modülde YOK.
 */
export const tenantsRepository = {
  async countDomainsByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: universityDomains.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(universityDomains)
      .where(and(inArray(universityDomains.universityId, universityIds), isNull(universityDomains.deletedAt)))
      .groupBy(universityDomains.universityId);
    return new Map(rows.map((r) => [r.universityId, r.count]));
  },

  async countUsersByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: users.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(users)
      .where(and(inArray(users.universityId, universityIds), isNull(users.deletedAt)))
      .groupBy(users.universityId);
    return new Map(rows.filter((r) => r.universityId).map((r) => [r.universityId!, r.count]));
  },

  async countClubsByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: clubs.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(clubs)
      .where(inArray(clubs.universityId, universityIds))
      .groupBy(clubs.universityId);
    return new Map(rows.map((r) => [r.universityId, r.count]));
  },

  async countPendingApplicationsByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: clubApplications.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(clubApplications)
      .where(and(inArray(clubApplications.universityId, universityIds), eq(clubApplications.status, "pending")))
      .groupBy(clubApplications.universityId);
    return new Map(rows.map((r) => [r.universityId, r.count]));
  },

  async findUserIdsByUniversity(universityId: string): Promise<string[]> {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.universityId, universityId), isNull(users.deletedAt)));
    return rows.map((r) => r.id);
  },
};
