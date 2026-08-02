/** Üniversiteler arası keşif kartı — kişisel veri yok. */
export type DiscoverActivitySummary = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  hostClub: { name: string };
  university: { id: string; name: string };
};

export type DiscoverActivitiesPage = {
  items: DiscoverActivitySummary[];
  nextCursor: string | null;
};
