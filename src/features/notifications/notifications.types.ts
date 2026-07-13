import { InferSelectModel } from "drizzle-orm";
import { notifications } from "../../db/schema";

export type Notification = InferSelectModel<typeof notifications>;

/**
 * Bildirim tipi kataloğu — `*.permissions.ts` dosyalarındaki kalıbın aynısı:
 * bu bir **typo güvenliği katmanıdır, kapalı bir küme değildir**. DB'deki
 * `notifications.type` bir varchar'dır; buraya eklemeden de yeni tip yazılabilir
 * (ama yazılmamalı — frontend ikon/derin link eşlemesini bu kataloğa göre yapar).
 *
 * Adlandırma: `kaynak.olay` (geçmiş zaman).
 */
export const NotificationType = {
  /** E-posta doğrulandı → açık sekmeler "hesabınızı doğrulayın" uyarısını kaldırır. */
  ACCOUNT_VERIFIED: "account.verified",
  /** Hesap askıya alındı. */
  ACCOUNT_SUSPENDED: "account.suspended",
  /** Hesabın askısı kaldırıldı. */
  ACCOUNT_UNSUSPENDED: "account.unsuspended",
  /** Yönetici şifreyi sıfırladı → kullanıcı geçici şifreyle girip değiştirmeli. */
  ACCOUNT_PASSWORD_RESET: "account.passwordReset",
  /** Kulüp kurma başvurusu karara bağlandı (onay/red). data: { applicationId, status, clubId? } */
  CLUB_APPLICATION_DECIDED: "club.application.decided",
  /** Kulübe katılma isteği karara bağlandı. data: { clubId, status } */
  CLUB_MEMBERSHIP_DECIDED: "club.membership.decided",
  /** Kullanıcıya global bir rol atandı. data: { roleId, roleName } */
  ROLE_ASSIGNED: "role.assigned",
} as const;

export type NotificationTypeKey = (typeof NotificationType)[keyof typeof NotificationType];

/** Bir bildirimi yaratmak için gereken yük (userId ayrı geçilir). */
export interface CreateNotificationPayload {
  type: NotificationTypeKey | string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

/** WebSocket üzerinden istemciye giden zarf. */
export type ServerEvent =
  | { event: "ready"; data: { userId: string } }
  | { event: "ping" }
  | { event: "notification"; data: Notification };
