import type {
  PublicActivityDetail,
  PublicActivitySummary,
  PublicClubPage,
  PublicClubRef,
} from "./public.types";

type ClubRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
};

type UniversityRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

type UpcomingRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  coverUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  hostClubId: string;
  hostClubName: string;
  hostClubSlug: string;
  hostClubLogoUrl: string | null;
};

type ActivityDetailRow = NonNullable<Awaited<ReturnType<typeof import("./public.repository").publicRepository.findActivityDetail>>>;

export function toPublicClubRef(
  club: { id: string; name: string; slug: string; logoUrl: string | null }
): PublicClubRef {
  return { id: club.id, name: club.name, slug: club.slug, logoUrl: club.logoUrl };
}

export function toPublicActivitySummary(row: UpcomingRow): PublicActivitySummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    coverUrl: row.coverUrl,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    hostClub: {
      id: row.hostClubId,
      name: row.hostClubName,
      slug: row.hostClubSlug,
      logoUrl: row.hostClubLogoUrl,
    },
  };
}

export function toPublicClubPage(
  university: UniversityRow,
  club: ClubRow,
  contactLinks: Array<{ id: string; platform: string; url: string }>,
  upcomingRows: UpcomingRow[]
): PublicClubPage {
  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
    description: club.description,
    logoUrl: club.logoUrl,
    coverUrl: club.coverUrl,
    university: {
      id: university.id,
      name: university.name,
      slug: university.slug,
      logoUrl: university.logoUrl,
    },
    contactLinks,
    upcomingActivities: upcomingRows.map(toPublicActivitySummary),
  };
}

export function toPublicActivityDetail(detail: ActivityDetailRow): PublicActivityDetail {
  const hosts = detail.activityClubs.filter((ac) => ac.role === "host").map((ac) => ac.club!);
  const coHosts = detail.activityClubs.filter((ac) => ac.role === "co_host").map((ac) => ac.club!);

  return {
    id: detail.id,
    title: detail.title,
    description: detail.description,
    location: detail.location,
    coverUrl: detail.coverUrl,
    startsAt: detail.startsAt,
    endsAt: detail.endsAt,
    capacity: detail.capacity,
    hostClub: toPublicClubRef(hosts[0]!),
    coHostClubs: coHosts.map(toPublicClubRef),
  };
}
