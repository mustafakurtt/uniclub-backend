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
  announcementsMessages
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
  | AnnouncementsMessageKey;
