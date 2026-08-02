import { and, asc, eq, gt, gte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  activities,
  activityClubs,
  clubs,
  tenantSettings,
  universities,
} from "../../db/schema";
import { TenantSettingKey } from "../tenant-settings/tenant-settings.catalog";
import type { DiscoverActivityRow } from "./discover.dto";
import type { DiscoverPageCursor } from "./discover.cursor";

function keysetAfter(cursor: DiscoverPageCursor): SQL {
  return or(
    gt(activities.startsAt, cursor.startsAt),
    and(eq(activities.startsAt, cursor.startsAt), gt(activities.id, cursor.id))
  )!;
}

export const discoverRepository = {
  /**
   * Ağdaki (bayrağı açık tenant'ların) `inter_university` görünürlüklü yaklaşan
   * etkinlikleri — host üniversite tenant bayrağı açık, çağıranın üniversitesi hariç.
   */
  async listInterUniversityActivities(
    viewerUniversityId: string,
    limit: number,
    cursor?: DiscoverPageCursor,
    filterUniversityId?: string
  ): Promise<DiscoverActivityRow[]> {
    const now = new Date();
    const filters: SQL[] = [
      eq(activities.visibility, "inter_university"),
      eq(activities.status, "published"),
      gte(activities.startsAt, now),
      eq(activityClubs.role, "host"),
      eq(activityClubs.status, "accepted"),
      eq(tenantSettings.value, true),
      sql`${clubs.universityId} <> ${viewerUniversityId}`,
    ];

    if (filterUniversityId) {
      filters.push(eq(clubs.universityId, filterUniversityId));
    }
    if (cursor) {
      filters.push(keysetAfter(cursor));
    }

    const rows = await db
      .select({
        id: activities.id,
        title: activities.title,
        description: activities.description,
        location: activities.location,
        startsAt: activities.startsAt,
        endsAt: activities.endsAt,
        hostClubName: clubs.name,
        universityId: clubs.universityId,
        universityName: universities.name,
      })
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .innerJoin(universities, eq(universities.id, clubs.universityId))
      .innerJoin(
        tenantSettings,
        and(
          eq(tenantSettings.universityId, clubs.universityId),
          eq(tenantSettings.key, TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED)
        )
      )
      .where(and(...filters))
      .orderBy(asc(activities.startsAt), asc(activities.id))
      .limit(limit);

    return rows;
  },
};
