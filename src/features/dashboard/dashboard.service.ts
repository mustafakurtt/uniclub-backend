import { dashboardRepository } from "./dashboard.repository";
import { dashboardCache } from "./dashboard.cache";
import { badRequest } from "../../shared/utils/errors";
import { FeedQueryDTO } from "./dashboard.schema";
import type { AdminDashboard, ClubDashboard, FeedPage, StudentSummary } from "./dashboard.types";

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

/**
 * dashboard iş kuralları — okuma modeli üstünde DTO montajı. Yazma yoktur.
 * Feed heterojen bir birleşimdir (duyuru + etkinlik): her iki kaynaktan `limit`
 * kadar çekilip zamanına (createdAt) göre birleştirilir ve tepe `limit` alınır
 * (k-yollu birleştirme; keyset cursor iki kaynakta da aynı createdAt eksenini kullanır).
 */
export const dashboardService = {
  // ── Öğrenci feed ──────────────────────────────────────────────────────────
  async getFeed(userId: string, query: FeedQueryDTO): Promise<FeedPage> {
    const cursor = query.cursor ? new Date(query.cursor) : undefined;
    if (cursor && Number.isNaN(cursor.getTime())) {
      throw badRequest("feed.invalidCursor");
    }

    const clubIds = await dashboardRepository.approvedClubIds(userId);
    if (clubIds.length === 0) return { items: [], nextCursor: null };

    const [anns, acts] = await Promise.all([
      dashboardRepository.feedAnnouncements(clubIds, cursor, query.limit),
      dashboardRepository.feedActivities(clubIds, cursor, query.limit),
    ]);

    const merged = [
      ...anns.map((a) => ({ type: "announcement" as const, at: a.createdAt, club: compactClub(a.club), item: stripClub(a) })),
      ...acts.map(({ activity, hostClub }) => ({ type: "activity" as const, at: activity.createdAt, club: compactClub(hostClub), item: activity })),
    ]
      .sort((x, y) => y.at.getTime() - x.at.getTime())
      .slice(0, query.limit);

    // Sayfa dolduysa devam imleci = son öğenin zamanı; dolmadıysa son sayfadayız.
    const nextCursor = merged.length === query.limit ? merged[merged.length - 1].at.toISOString() : null;
    return {
      items: merged.map((i) => ({ ...i, at: i.at.toISOString() })),
      nextCursor,
    };
  },

  // ── Öğrenci özeti (kısa TTL cache) ────────────────────────────────────────
  getStudentSummary(userId: string): Promise<StudentSummary> {
    return dashboardCache.student(userId, async () => {
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
    return dashboardCache.club(clubId, async () => {
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
    return dashboardCache.admin(universityId, async () => {
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
