import { mergeCatalogs } from "../../core/i18n/translator";
import { commonMessages, type CommonMessageKey } from "./common.messages";
import { universityMessages, type UniversityMessageKey } from "../../features/university/university.messages";
import { moderationMessages, type ModerationMessageKey } from "../../features/moderation/moderation.messages";
import { auditMessages, type AuditMessageKey } from "../../features/audit/audit.messages";
import { usersMessages, type UsersMessageKey } from "../../features/users/users.messages";
import {
  announcementsMessages,
  type AnnouncementsMessageKey,
} from "../../features/announcements/announcements.messages";
import { galleryMessages, type GalleryMessageKey } from "../../features/gallery/gallery.messages";
import { adminMessages, type AdminMessageKey } from "../../features/admin/admin.messages";
import {
  notificationsMessages,
  type NotificationsMessageKey,
} from "../../features/notifications/notifications.messages";
import { authMessages, type AuthMessageKey } from "../../features/auth/auth.messages";
import { clubsMessages, type ClubsMessageKey } from "../../features/clubs/clubs.messages";

/**
 * i18n KOMPOZİSYON KÖKÜ — burada mesaj metni YAZILMAZ, sadece feature/ortak
 * katalog parçaları birleştirilir. Her feature kendi `*.messages.ts` dosyasını
 * taşır (bkz. features/university/university.messages.ts); yeni bir feature'ı çok
 * dilliye açmak = katalogunu buraya eklemek. `mergeCatalogs` anahtar çakışmasını
 * yükleme anında yakalar.
 */
export const messages = mergeCatalogs(
  commonMessages,
  universityMessages,
  moderationMessages,
  auditMessages,
  usersMessages,
  announcementsMessages,
  galleryMessages,
  adminMessages,
  notificationsMessages,
  authMessages,
  clubsMessages
);

/**
 * Uygulamadaki tüm geçerli mesaj anahtarları. Tipli hata fabrikaları
 * (shared/utils/errors.ts) ve responder (shared/utils/respond.ts) bunu kullanır;
 * böylece yanlış/yazım hatalı anahtar DERLEME hatası olur. Yeni feature = union'a
 * bir `... | XMessageKey` eklemek (kataloguyla birlikte).
 */
export type MessageKey =
  | CommonMessageKey
  | UniversityMessageKey
  | ModerationMessageKey
  | AuditMessageKey
  | UsersMessageKey
  | AnnouncementsMessageKey
  | GalleryMessageKey
  | AdminMessageKey
  | NotificationsMessageKey
  | AuthMessageKey
  | ClubsMessageKey;
