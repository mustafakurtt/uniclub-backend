/**
 * admin feature'ının sahip olduğu RBAC izin anahtarları.
 *
 * Not: Bu obje KAPALI bir enum değildir — permissions tablosu runtime'da
 * role.manage/permission.manage endpoint'leri üzerinden genişletilebilir.
 * Bu sabitin tek amacı, bu feature'ın bugün bildiği anahtarları TEK bir yerde
 * tutup route/seed gibi çağrı noktalarında yazım hatasını (typo) önlemektir.
 *
 * Not: Kulüp yönetimi yetkileri (club.approve / club.update / club.advisor.manage
 * / club.delete) artık clubs feature'ına aittir — bkz. clubs.permissions.ts
 * (ClubPermission). admin.routes bu iki kaynaktan da import eder.
 */
export const AdminPermission = {
  // Kullanıcıları görüntüleme (salt-okunur: liste + detay + effective yetki).
  USER_VIEW: "user.view",
  // Kullanıcı durumunu (askı) ve bölümünü değiştirme.
  USER_MANAGE: "user.manage",
} as const;

export type AdminPermission = (typeof AdminPermission)[keyof typeof AdminPermission];

/**
 * Seed ve "tüm user yetkileri" gerektiren yerler için düz katalog. Okuma (view)
 * ile yazma (manage) bilinçli olarak ayrıldı ki salt-okunur roller (auditor)
 * tanımlanabilsin (bkz. docs/yonetim/06).
 */
export const ADMIN_PERMISSION_CATALOG: { key: AdminPermission; description: string }[] = [
  { key: AdminPermission.USER_VIEW, description: "Kullanıcıları görüntüleme (salt-okunur)" },
  { key: AdminPermission.USER_MANAGE, description: "Kullanıcı durumu ve bölümünü yönetme" },
];
