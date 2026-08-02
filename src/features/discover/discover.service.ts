import { badRequest } from "../../shared/utils/errors";
import { discoverRepository } from "./discover.repository";
import { toDiscoverActivitySummary } from "./discover.dto";
import { decodeDiscoverCursor, encodeDiscoverCursor, type DiscoverPageCursor } from "./discover.cursor";
import type { ListDiscoverActivitiesQueryDTO } from "./discover.schema";
import type { DiscoverActivitiesPage } from "./discover.types";

export const discoverService = {
  async listActivities(viewerUniversityId: string, query: ListDiscoverActivitiesQueryDTO): Promise<DiscoverActivitiesPage> {
    let cursor: DiscoverPageCursor | undefined;
    if (query.cursor) {
      const parsed = decodeDiscoverCursor(query.cursor);
      if (!parsed) {
        throw badRequest("discover.invalidCursor");
      }
      cursor = parsed;
    }

    const limit = query.limit;
    const rows = await discoverRepository.listInterUniversityActivities(
      viewerUniversityId,
      limit + 1,
      cursor,
      query.universityId
    );

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map(toDiscoverActivitySummary);
    const last = pageRows.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? encodeDiscoverCursor(last.startsAt, last.id)
        : null;

    return { items, nextCursor };
  },
};
