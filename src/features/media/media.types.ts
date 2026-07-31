import type { InferSelectModel } from "drizzle-orm";
import { media } from "../../db/schema";

export type Media = InferSelectModel<typeof media>;

/**
 * Yükleme amacı kataloğu — `notifications.types`/`*.permissions` ile aynı kalıp:
 * typo-güvenliği katmanı, KAPALI küme değil (DB'de purpose düz varchar). Frontend
 * hangi alana yazılacağını (avatar → users.photoUrl, club_logo → clubs.logoUrl...)
 * bu değere göre eşler. Doğrulama serviste bu listeye göre yapılır.
 */
export const MediaPurpose = {
  AVATAR: "avatar",
  CLUB_LOGO: "club_logo",
  CLUB_COVER: "club_cover",
  GALLERY: "gallery",
  OTHER: "other",
} as const;

export type MediaPurpose = (typeof MediaPurpose)[keyof typeof MediaPurpose];

export const MEDIA_PURPOSES: string[] = Object.values(MediaPurpose);

/** Upload yanıtı — üretilen kayıt kimliği + servis edilebilir URL. */
export interface UploadResult {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  purpose: string;
}
