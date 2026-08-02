import type { DiscoverActivitySummary } from "./discover.types";

export type DiscoverActivityRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  hostClubName: string;
  universityId: string;
  universityName: string;
};

export function toDiscoverActivitySummary(row: DiscoverActivityRow): DiscoverActivitySummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    hostClub: { name: row.hostClubName },
    university: { id: row.universityId, name: row.universityName },
  };
}
