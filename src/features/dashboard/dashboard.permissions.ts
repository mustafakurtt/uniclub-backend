/**
 * dashboard feature'ının GLOBAL (RBAC) izin anahtarları.
 *
 * Öğrenci feed'i/özeti self-service'tir (izin gerektirmez); kulüp paneli kulüp-içi
 * katmandan (requireClubStaff) korunur. Buradaki `dashboard.view` ise TENANT
 * seviyesi ADMIN panelinin (kulüp/kullanıcı durum dağılımları, bekleyen başvuru,
 * yaklaşan etkinlik sayaçları) yetkisidir — salt-okuma.
 *
 * `user.view` yerine ayrı bir anahtar: admin paneli yalnızca kullanıcıları değil
 * kulüp/başvuru/etkinlik sayaçlarını da gösterir; kapsamı user.view'dan geniştir
 * ve bir role "yalnızca panel özeti" verilebilsin diye ayrık tutulur.
 */
export const DashboardPermission = {
  VIEW: "dashboard.view",
} as const;

export type DashboardPermission = (typeof DashboardPermission)[keyof typeof DashboardPermission];

export const DASHBOARD_PERMISSION_CATALOG: { key: DashboardPermission; description: string }[] = [
  { key: DashboardPermission.VIEW, description: "Tenant yönetim paneli özetini görüntüleme (salt-okunur)" },
];
