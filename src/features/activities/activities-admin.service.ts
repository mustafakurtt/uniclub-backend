import { decodeDiscoverCursor, encodeDiscoverCursor } from "../discover/discover.cursor";
import { clubsAdminRepository } from "../clubs/clubs-admin.repository";
import { badRequest, notFound } from "../../shared/utils/errors";
import { activitiesRepository } from "./activities.repository";
import type { AdminTenantActivitiesQueryDTO } from "./activities.schema";

export const activitiesAdminService = {
  /** Tenant geneli etkinlik listesi — activity.moderate; kulüp adı gömülü. */
  async listTenantActivities(universityId: string, query: AdminTenantActivitiesQueryDTO) {
    const { scope, limit, cursor, clubId } = query;

    if (clubId) {
      const club = await clubsAdminRepository.findClubInUniversity(universityId, clubId);
      if (!club) {
        throw notFound("admin.clubNotFound");
      }
    }

    let pageCursor: { startsAt: Date; id: string } | undefined;
    if (cursor) {
      const decoded = decodeDiscoverCursor(cursor);
      if (!decoded) {
        throw badRequest("validation.failed");
      }
      pageCursor = decoded;
    }

    const rows = await activitiesRepository.listTenantActivitiesForAdmin(
      universityId,
      scope,
      limit,
      pageCursor,
      clubId
    );
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore
        ? encodeDiscoverCursor(items[items.length - 1].startsAt, items[items.length - 1].id)
        : null;

    return { items, nextCursor };
  },
};
