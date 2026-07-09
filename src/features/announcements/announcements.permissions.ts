/**
 * announcements feature'ının GLOBAL (RBAC) izin anahtarları.
 *
 * Kulüp-içi katman (officer/president/advisor) kendi kulübünün duyurusunu
 * oluşturur/siler (club.middleware). Buradaki `announcement.moderate` ise
 * TENANT seviyesi bir override'dır: bir okul yöneticisi/moderatörü, HERHANGİ
 * bir kulübün uygunsuz duyurusunu kaldırabilir (bkz. docs/yonetim/06 §A6).
 *
 * Not: Bu obje KAPALI bir enum değildir — permissions tablosu runtime'da
 * genişletilebilir; amaç anahtarları tek yerde tutup typo'yu önlemektir.
 */
export const AnnouncementPermission = {
  MODERATE: "announcement.moderate",
} as const;

export type AnnouncementPermission = (typeof AnnouncementPermission)[keyof typeof AnnouncementPermission];

export const ANNOUNCEMENT_PERMISSION_CATALOG: { key: AnnouncementPermission; description: string }[] = [
  { key: AnnouncementPermission.MODERATE, description: "Herhangi bir kulübün duyurusunu kaldırma (moderasyon)" },
];
