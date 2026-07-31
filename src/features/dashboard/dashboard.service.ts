import { dashboardRepository } from "./dashboard.repository";
import { dashboardCache } from "./dashboard.cache";
import { badRequest } from "../../shared/utils/errors";
import { FeedQueryDTO } from "./dashboard.schema";
import { decodeFeedCursor, encodeFeedCursor, type FeedPageCursor } from "./feed-cursor";
import type { AdminDashboard, ClubDashboard, FeedPage, StudentSummary } from "./dashboard.types";

/** Feed birleşim sırası: at DESC, kind DESC (activity > announcement > university_announcement), id DESC. */
const FEED_KIND_ORDER = { university_announcement: 0, announcement: 1, activity: 2 } as const;

/** Feed/özet kartlarında dönen kompakt kulüp gösterimi. */
function compactClub(club: any) {
  if (!club) return null;
  return { id: club.id, name: club.name, slug: club.slug, logoUrl: club.logoUrl };
}

/** İlişki alanını atıp düz entity döndürür (feed item'ında kulüp ayrı alan). */
function stripClub<T extends { club?: unknown }>(row: T): Omit<T, "club"> {
  const { club: _c, ...rest } = row;
  return rest;
}

function feedSortKey(
  at: Date,
  kind: "university_announcement" | "announcement" | "activity",
  id: string
): [number, number, string] {
  return [at.getTime(), FEED_KIND_ORDER[kind], id];
}

function compareFeedKeys(a: [number, number, string], b: [number, number, string]): number {
  if (a[0] !== b[0]) return b[0] - a[0];
  if (a[1] !== b[1]) return b[1] - a[1];
  return b[2].localeCompare(a[2]);
}

/**
 * dashboard iş kuralları — okuma modeli üstünde DTO montajı. Yazma yoktur.
 * Feed heterojen birleşimdir (duyuru + etkinlik): her kaynaktan `limit+1` çekilip
 * (at, kind, id) tie-break ile birleştirilir; opak cursor son öğenin üçlüsünü taşır.
 */
export const dashboardService = {
  // ── Öğrenci feed ──────────────────────────────────────────────────────────
  async getFeed(userId: string, query: FeedQueryDTO): Promise<FeedPage> {
    let cursor: FeedPageCursor | undefined;
    if (query.cursor) {
      const decoded = decodeFeedCursor(query.cursor);
      if (!decoded) {
        throw badRequest("feed.invalidCursor");
      }
      cursor = decoded;
    }

    const clubIds = await dashboardRepository.approvedClubIds(userId);
    const universityId = await dashboardRepository.getUserUniversityId(userId);
    if (clubIds.length === 0 && !universityId) return { items: [], nextCursor: null };

    const fetchLimit = query.limit + 1;
    const [annPage, uniAnnPage, actPage] = await Promise.all([
      dashboardRepository.feedAnnouncements(clubIds, cursor, fetchLimit),
      universityId
        ? dashboardRepository.feedUniversityAnnouncements(universityId, cursor, fetchLimit)
        : Promise.resolve({ rows: [], hasMore: false }),
      clubIds.length > 0
        ? dashboardRepository.feedActivities(clubIds, cursor, fetchLimit)
        : Promise.resolve({ rows: [], hasMore: false }),
    ]);

    const merged = [
      ...uniAnnPage.rows.map((a) => ({
        type: "university_announcement" as const,
        at: a.publishedAt ?? a.createdAt,
        id: a.id,
        club: null,
        item: a,
      })),
      ...annPage.rows.map((a) => ({
        type: "announcement" as const,
        at: a.publishedAt ?? a.createdAt,
        id: a.id,
        club: compactClub(a.club),
        item: stripClub(a),
      })),
      ...actPage.rows.map(({ activity, hostClub }) => ({
        type: "activity" as const,
        at: activity.createdAt,
        id: activity.id,
        club: compactClub(hostClub),
        item: activity,
      })),
    ].sort((x, y) =>
      compareFeedKeys(
        feedSortKey(x.at, x.type, x.id),
        feedSortKey(y.at, y.type, y.id)
      )
    );

    const page = merged.slice(0, query.limit);
    const hasMore =
      merged.length > query.limit ||
      annPage.hasMore ||
      uniAnnPage.hasMore ||
      actPage.hasMore;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeFeedCursor(last.at, last.type, last.id) : null;

    return {
      items: page.map((i) => ({ ...i, at: i.at.toISOString() })),
      nextCursor,
    };
  },

  // ── Öğrenci özeti (kısa TTL cache) ────────────────────────────────────────
  getStudentSummary(userId: string): Promise<StudentSummary> {
    return dashboardCache.student(userId).read(async () => {
      const [clubCount, upcomingAttendingCount, pendingJoinRequests, pendingApplications, next] =
        await Promise.all([
          dashboardRepository.countApprovedMemberships(userId),
          dashboardRepository.countUpcomingAttending(userId),
          dashboardRepository.countPendingMemberships(userId),
          dashboardRepository.countPendingApplications(userId),
          dashboardRepository.nextAttending(userId),
        ]);

      return {
        clubCount,
        upcomingAttendingCount,
        pendingJoinRequests,
        pendingApplications,
        nextActivity: next ? { ...stripHost(next), hostClub: compactClub(next.hostClub) } : null,
      };
    });
  },

  // ── Kulüp paneli (staff) (kısa TTL cache) ─────────────────────────────────
  getClubDashboard(clubId: string): Promise<ClubDashboard> {
    return dashboardCache.club(clubId).read(async () => {
      const [memberCount, pendingJoinRequests, upcomingActivityCount, announcementCount] =
        await Promise.all([
          dashboardRepository.countApprovedMembers(clubId),
          dashboardRepository.countPendingRequests(clubId),
          dashboardRepository.countClubUpcomingActivities(clubId),
          dashboardRepository.countClubAnnouncements(clubId),
        ]);
      return { memberCount, pendingJoinRequests, upcomingActivityCount, announcementCount };
    });
  },

  // ── Admin özeti (tenant) (kısa TTL cache) ─────────────────────────────────
  getAdminDashboard(universityId: string): Promise<AdminDashboard> {
    return dashboardCache.admin(universityId).read(async () => {
      const [clubsByStatus, usersByStatus, pendingApplications, upcomingActivityCount] =
        await Promise.all([
          dashboardRepository.clubStatusCounts(universityId),
          dashboardRepository.userStatusCounts(universityId),
          dashboardRepository.countTenantPendingApplications(universityId),
          dashboardRepository.countTenantUpcomingActivities(universityId),
        ]);
      return { clubsByStatus, usersByStatus, pendingApplications, upcomingActivityCount };
    });
  },
};

/** nextAttending satırından hostClub alanını ayırır (kompakt hâli ayrı eklenir). */
function stripHost<T extends { hostClub?: unknown }>(row: T): Omit<T, "hostClub"> {
  const { hostClub: _h, ...rest } = row;
  return rest;
}
