import type { InferSelectModel } from "drizzle-orm";
import { announcements, activities } from "../../db/schema";

/**
 * dashboard feature'ının okuma-modeli (read model) DTO tipleri. Yeni bir tablo
 * yok; bu tipler mevcut entity'lerden türetilir + montaj DTO'larını tanımlar
 * (aynı diğer `*.types.ts` konvansiyonu).
 */

/** Feed öğesinde/özet kartında dönen kompakt kulüp gösterimi. */
export interface CompactClub {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/** Öğrenci akışında tek öğe — duyuru VEYA yayınlanmış etkinlik. */
export type FeedItem =
  | { type: "announcement"; at: string; club: CompactClub | null; item: Omit<InferSelectModel<typeof announcements>, "club"> }
  | { type: "activity"; at: string; club: CompactClub | null; item: InferSelectModel<typeof activities> };

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/** Öğrenci panel özeti. */
export interface StudentSummary {
  clubCount: number;
  upcomingAttendingCount: number;
  pendingJoinRequests: number;
  pendingApplications: number;
  nextActivity: (InferSelectModel<typeof activities> & { hostClub: CompactClub | null }) | null;
}

/** Kulüp paneli özeti (staff). */
export interface ClubDashboard {
  memberCount: number;
  pendingJoinRequests: number;
  upcomingActivityCount: number;
  announcementCount: number;
}

/** Admin (tenant) paneli özeti. */
export interface AdminDashboard {
  clubsByStatus: Record<string, number>;
  usersByStatus: Record<string, number>;
  pendingApplications: number;
  upcomingActivityCount: number;
}
