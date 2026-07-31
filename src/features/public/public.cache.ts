import { defineKeyspace, entry } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { PublicActivityDetail, PublicClubPage } from "./public.types";

/**
 * Kamuya açık okuma cache — kimliğe bağlı değil; TTL ile bayatlık sınırlı.
 */
export const publicCache = defineKeyspace(cache, "public", {
  club: entry<PublicClubPage>()(
    (universityId: string, clubSlug: string) => `club:${universityId}:${clubSlug}`,
    { ttlSeconds: 300 }
  ),
  activity: entry<PublicActivityDetail>()(
    (universityId: string, activityId: string) => `activity:${universityId}:${activityId}`,
    { ttlSeconds: 300 }
  ),
});
