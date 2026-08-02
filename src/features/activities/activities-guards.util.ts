import { activitiesRepository } from "./activities.repository";
import { activitiesCache } from "./activities.cache";
import { toSafeUser } from "../../shared/utils/user.util";
import { notFound, badRequest, forbidden } from "../../shared/utils/errors";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import {
  TenantSettingKey,
  isTenantFeatureEnabled,
} from "../tenant-settings/tenant-settings.catalog";
import type { Activity, ActivityVisibility } from "./activities.types";

export type ActivityDetail = NonNullable<Awaited<ReturnType<typeof activitiesRepository.findDetailById>>>;
export type AcceptedClubLink = ActivityDetail["activityClubs"][number];

export async function fetchActivityDetail(activityId: string): Promise<ActivityDetail> {
  const detail = await activitiesCache.detail(activityId).read(() =>
    activitiesRepository.findDetailById(activityId)
  );
  if (!detail) {
    throw notFound("activity.notFound");
  }
  return detail;
}

export function acceptedClubLinks(detail: ActivityDetail): AcceptedClubLink[] {
  return detail.activityClubs.filter((ac) => ac.status === "accepted");
}

export function assertActivityPublished(detail: ActivityDetail) {
  if (detail.status === "draft") {
    throw notFound("activity.notFound"); // taslak dışarı görünmez
  }
  if (detail.status === "cancelled") {
    throw badRequest("activity.cancelled");
  }
}

export async function assertActivityVisibility(
  userId: string,
  acceptedClubs: AcceptedClubLink[],
  visibility: ActivityDetail["visibility"]
) {
  if (visibility !== "members") return;
  const clubIds = acceptedClubs.map((ac) => ac.clubId);
  const isMember = await activitiesRepository.isApprovedMemberOfAny(userId, clubIds);
  if (!isMember) {
    throw forbidden("activity.membersOnly");
  }
}

/** Accepted host/co-host kulüplerinin tenant kümesinde olma — ilk kapı; dış tenant'a varlık sızdırmaz. */
export function assertAcceptedClubTenant(universityId: string, acceptedClubs: AcceptedClubLink[]) {
  const clubUniversityIds = acceptedClubs
    .map((ac) => ac.club?.universityId)
    .filter((id): id is string => id != null);
  if (!clubUniversityIds.includes(universityId)) {
    throw notFound("activity.notFound");
  }
}

/**
 * RSVP (ve detay) kapısı: tenant → yayın durumu → görünürlük.
 * Tenant ilk — kapsam dışı çağırana 404; görünürlük/iptal 403/400 sızdırmaz.
 * İki katman da geçmeli; "üstüne gelir" sıra değil, birlikte uygulanma anlamında.
 */
export async function assertCanRsvp(userId: string, universityId: string, activityId: string) {
  const detail = await fetchActivityDetail(activityId);
  const accepted = acceptedClubLinks(detail);
  assertAcceptedClubTenant(universityId, accepted);
  assertActivityPublished(detail);
  await assertActivityVisibility(userId, accepted, detail.visibility);
  return detail;
}

/** Etkinlik var + bu kulüp onun HOST'u — değilse 404/403. Yönetim rotalarının ortak guard'ı. */
export async function requireHostedActivity(hostClubId: string, activityId: string): Promise<Activity> {
  const activity = await activitiesRepository.findById(activityId);
  if (!activity) {
    throw notFound("activity.notFound");
  }
  if (!(await activitiesRepository.isHostClub(activityId, hostClubId))) {
    throw forbidden("activity.notAHostClub");
  }
  return activity;
}

export function assertValidWindow(startsAt: Date, endsAt: Date | null | undefined) {
  if (startsAt.getTime() < Date.now()) {
    throw badRequest("activity.startInPast");
  }
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw badRequest("activity.endBeforeStart");
  }
}

export async function assertInterUniversityVisibilityAllowed(
  hostClubId: string,
  actorId: string,
  visibility: ActivityVisibility | undefined,
  options?: { allowModerator?: boolean }
) {
  if (visibility !== "inter_university") return;

  const universityId = await activitiesRepository.getClubUniversityId(hostClubId);
  if (!universityId) {
    throw notFound("club.notFound");
  }

  const settings = await getTenantSettings(universityId);
  if (!isTenantFeatureEnabled(settings, TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED)) {
    throw badRequest("activity.interUniversityDisabled");
  }

  if (options?.allowModerator) return;

  const isOfficer = await activitiesRepository.isClubOfficerOrPresident(hostClubId, actorId);
  if (!isOfficer) {
    throw forbidden("activity.interUniversityForbidden");
  }
}

/** Yoklama QR penceresi: başlangıçtan 30 dk önce — bitiş + 30 dk (bitiş yoksa +2h varsayım). */
const CHECK_IN_WINDOW_BEFORE_MS = 30 * 60 * 1000;
const CHECK_IN_WINDOW_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

export function assertCheckInWindow(startsAt: Date, endsAt: Date | null) {
  const now = Date.now();
  const openAt = startsAt.getTime() - CHECK_IN_WINDOW_BEFORE_MS;
  const eventEnd = endsAt ?? new Date(startsAt.getTime() + DEFAULT_EVENT_DURATION_MS);
  const closeAt = eventEnd.getTime() + CHECK_IN_WINDOW_AFTER_MS;
  if (now < openAt) {
    throw badRequest("activity.checkInNotOpen");
  }
  if (now > closeAt) {
    throw badRequest("activity.checkInClosed");
  }
}

/** İlişki alanlarını (activityClubs/creator) atıp düz etkinlik satırını döndürür. */
export function stripJoins<T extends { activityClubs?: unknown; creator?: unknown }>(row: T): Omit<T, "activityClubs" | "creator"> {
  const { activityClubs: _ac, creator: _c, ...rest } = row;
  return rest;
}

export { toSafeUser };
