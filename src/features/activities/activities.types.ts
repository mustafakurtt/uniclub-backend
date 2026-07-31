import { InferSelectModel } from "drizzle-orm";
import { activities, activityClubs, activityAttendees } from "../../db/schema";

/**
 * activities feature'ının Drizzle-türetimli entity tipleri + repository payload
 * arayüzleri (aynı diğer `*.types.ts` konvansiyonu). Şema tek kaynak; buradaki
 * tipler ondan türetilir, elle senkron tutulmaz.
 */
export type Activity = InferSelectModel<typeof activities>;
export type ActivityClub = InferSelectModel<typeof activityClubs>;
export type ActivityAttendee = InferSelectModel<typeof activityAttendees>;

export type ActivityStatus = Activity["status"]; // draft | published | cancelled
export type ActivityVisibility = Activity["visibility"]; // university | members
export type RsvpStatus = ActivityAttendee["status"]; // going | interested | waitlist

/** Yeni etkinlik oluşturma yükü (host kulüp + oluşturan ayrı geçilir). */
export interface CreateActivityPayload {
  title: string;
  description?: string | null;
  location?: string | null;
  coverUrl?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  capacity?: number | null;
  visibility: ActivityVisibility;
}

/** Etkinlik güncelleme yükü — verilen alanlar güncellenir (hepsi opsiyonel). */
export interface UpdateActivityPayload {
  title?: string;
  description?: string | null;
  location?: string | null;
  coverUrl?: string | null;
  startsAt?: Date;
  endsAt?: Date | null;
  capacity?: number | null;
  visibility?: ActivityVisibility;
}
