/**
 * activities feature'ının GLOBAL (RBAC) izin anahtarları.
 *
 * Kulüp-içi katman (officer/president/advisor) kendi kulübünün etkinliğini
 * oluşturur/yönetir (club.middleware). Buradaki `activity.moderate` ise TENANT
 * seviyesi bir override'dır: bir okul yöneticisi/moderatörü, HERHANGİ bir kulübün
 * uygunsuz etkinliğini iptal edebilir (aynı `announcement.moderate`/`gallery.moderate`
 * deseni — bkz. docs/yonetim/06 §A6).
 *
 * Not: Bu obje KAPALI bir enum değildir — permissions tablosu runtime'da
 * genişletilebilir; amaç anahtarları tek yerde tutup typo'yu önlemektir.
 */
export const ActivityPermission = {
  MODERATE: "activity.moderate",
} as const;

export type ActivityPermission = (typeof ActivityPermission)[keyof typeof ActivityPermission];

export const ACTIVITY_PERMISSION_CATALOG: { key: ActivityPermission; description: string }[] = [
  { key: ActivityPermission.MODERATE, description: "Herhangi bir kulübün etkinliğini iptal etme (moderasyon)" },
];
