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
  /** Başvuruda revizyon talebi — öğrenci düzeltip yeniden göndermeli. data: { applicationId, step } */
  CLUB_APPLICATION_REVISION_REQUESTED: "club.application.revision_requested",
  /** Kuruluş önerisi destek eşiğini aştı — başvuru onay zincirine düştü. data: { proposalId, applicationId } */
  CLUB_FORMATION_THRESHOLD_REACHED: "club.formation.threshold_reached",
  /** Kulübe katılma isteği karara bağlandı. data: { clubId, status } */
  CLUB_MEMBERSHIP_DECIDED: "club.membership.decided",
  /** Kullanıcıya global bir rol atandı. data: { roleId, roleName } */
  ROLE_ASSIGNED: "role.assigned",
  /** Yayınlanan etkinlik. data: { activityId, clubId } */
  ACTIVITY_PUBLISHED: "activity.published",
  /** Kulüp yeni duyuru yayınladı. data: { announcementId, clubId } */
  ANNOUNCEMENT_PUBLISHED: "announcement.published",
  /** Okul geneli duyuru yayınlandı. data: { announcementId, universityId } */
  ANNOUNCEMENT_UNIVERSITY_PUBLISHED: "announcement.university.published",
  /** Katılım bildirilen bir etkinlik iptal edildi. data: { activityId } */
  ACTIVITY_CANCELLED: "activity.cancelled",
  /** Kulüp bir etkinliğe co-host olarak davet edildi. data: { activityId, hostClubId, clubId } */
  ACTIVITY_COHOST_INVITED: "activity.coHostInvited",
} as const;

export type NotificationTypeKey = (typeof NotificationType)[keyof typeof NotificationType];

/** Tip kataloğu meta — frontend ayar ekranı ve susturulamaz tebligat ayrımı. */
export const NotificationTypeMeta: Record<
  NotificationTypeKey,
  { optOutable: boolean; labelTr: string; labelEn: string }
> = {
  [NotificationType.ACCOUNT_VERIFIED]: {
    optOutable: false,
    labelTr: "E-posta doğrulandı",
    labelEn: "Email verified",
  },
  [NotificationType.ACCOUNT_SUSPENDED]: {
    optOutable: false,
    labelTr: "Hesap askıya alındı",
    labelEn: "Account suspended",
  },
  [NotificationType.ACCOUNT_UNSUSPENDED]: {
    optOutable: false,
    labelTr: "Hesap askısı kaldırıldı",
    labelEn: "Account unsuspended",
  },
  [NotificationType.ACCOUNT_PASSWORD_RESET]: {
    optOutable: false,
    labelTr: "Şifre sıfırlandı",
    labelEn: "Password reset",
  },
  [NotificationType.CLUB_APPLICATION_DECIDED]: {
    optOutable: false,
    labelTr: "Kulüp kurma başvurusu kararı",
    labelEn: "Club application decision",
  },
  [NotificationType.CLUB_APPLICATION_REVISION_REQUESTED]: {
    optOutable: false,
    labelTr: "Kulüp başvurusu revizyon talebi",
    labelEn: "Club application revision request",
  },
  [NotificationType.CLUB_FORMATION_THRESHOLD_REACHED]: {
    optOutable: false,
    labelTr: "Kuruluş önerisi eşiği aşıldı",
    labelEn: "Formation proposal threshold reached",
  },
  [NotificationType.CLUB_MEMBERSHIP_DECIDED]: {
    optOutable: false,
    labelTr: "Kulüp üyelik kararı",
    labelEn: "Club membership decision",
  },
  [NotificationType.ROLE_ASSIGNED]: {
    optOutable: false,
    labelTr: "Rol atandı",
    labelEn: "Role assigned",
  },
  [NotificationType.ACTIVITY_PUBLISHED]: {
    optOutable: true,
    labelTr: "Yeni etkinlik",
    labelEn: "New activity",
  },
  [NotificationType.ANNOUNCEMENT_PUBLISHED]: {
    optOutable: true,
    labelTr: "Yeni duyuru",
    labelEn: "New announcement",
  },
  [NotificationType.ANNOUNCEMENT_UNIVERSITY_PUBLISHED]: {
    optOutable: true,
    labelTr: "Okul geneli duyuru",
    labelEn: "University-wide announcement",
  },
  [NotificationType.ACTIVITY_CANCELLED]: {
    optOutable: true,
    labelTr: "Etkinlik iptal",
    labelEn: "Activity cancelled",
  },
  [NotificationType.ACTIVITY_COHOST_INVITED]: {
    optOutable: true,
    labelTr: "Co-host daveti",
    labelEn: "Co-host invitation",
  },
};

export function isOptOutableNotificationType(type: string): boolean {
  if (!(type in NotificationTypeMeta)) return false;
  return NotificationTypeMeta[type as NotificationTypeKey].optOutable;
}

export const OPT_OUTABLE_NOTIFICATION_TYPES = Object.entries(NotificationTypeMeta)
  .filter(([, meta]) => meta.optOutable)
  .map(([type, meta]) => ({
    type,
    labelTr: meta.labelTr,
    labelEn: meta.labelEn,
  }));

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
