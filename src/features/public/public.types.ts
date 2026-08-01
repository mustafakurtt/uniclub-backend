/** Kamuya açık kulüp sayfası — kişisel veri içermez. */
export type PublicClubPage = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  university: { id: string; name: string; slug: string; logoUrl: string | null };
  contactLinks: Array<{ id: string; platform: string; url: string }>;
  upcomingActivities: PublicActivitySummary[];
};

/** Kamuya açık etkinlik özeti (liste kartı). */
export type PublicActivitySummary = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  coverUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  hostClub: PublicClubRef;
};

/** Kamuya açık etkinlik detayı — katılımcı/üye kişisel verisi yok. */
export type PublicActivityDetail = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  coverUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  capacity: number | null;
  hostClub: PublicClubRef;
  coHostClubs: PublicClubRef[];
};

export type PublicClubRef = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};
