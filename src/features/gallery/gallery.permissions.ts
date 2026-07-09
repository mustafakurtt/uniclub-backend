/**
 * gallery feature'ının GLOBAL (RBAC) izin anahtarları.
 *
 * Kulüp-içi katman (officer/president/advisor) kendi kulübünün galerisini
 * yönetir (club.middleware). Buradaki `gallery.moderate` TENANT seviyesi bir
 * override'dır: bir okul yöneticisi/moderatörü, HERHANGİ bir kulübün uygunsuz
 * görselini kaldırabilir (bkz. docs/yonetim/06 §A6).
 */
export const GalleryPermission = {
  MODERATE: "gallery.moderate",
} as const;

export type GalleryPermission = (typeof GalleryPermission)[keyof typeof GalleryPermission];

export const GALLERY_PERMISSION_CATALOG: { key: GalleryPermission; description: string }[] = [
  { key: GalleryPermission.MODERATE, description: "Herhangi bir kulübün galeri görselini kaldırma (moderasyon)" },
];
