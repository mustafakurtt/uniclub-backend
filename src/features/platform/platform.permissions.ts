/**
 * platform feature'ının GLOBAL (RBAC) izin anahtarları — SaaS operatör paneli.
 *
 * Tenant oluşturma `university.create` ile kalır; bu katalog liste/istatistik ve
 * tenant durum yönetimini kapsar.
 */
export const PlatformPermission = {
  /** Tenant listesi + özet istatistikler (salt-okunur). */
  TENANT_VIEW: "platform.tenant.view",
  /** Tenant durumu (askıya alma / yeniden açma). */
  TENANT_MANAGE: "platform.tenant.manage",
  /** Tenant yöneticisi provision (ilk admin davet / oluşturma). */
  TENANT_INVITE: "platform.tenant.invite",
  /** Platform hesap listesi (universityId=null). */
  USER_VIEW: "platform.user.view",
  /** Platform hesabı oluşturma ve rol atama (yalnızca super_admin bundle). */
  USER_MANAGE: "platform.user.manage",
} as const;

export type PlatformPermission = (typeof PlatformPermission)[keyof typeof PlatformPermission];

export const PLATFORM_PERMISSION_CATALOG: { key: PlatformPermission; description: string }[] = [
  { key: PlatformPermission.TENANT_VIEW, description: "Platform tenant listesi ve özet istatistikler (salt-okunur)" },
  { key: PlatformPermission.TENANT_MANAGE, description: "Tenant durumu yönetimi (askıya alma / yeniden açma)" },
  { key: PlatformPermission.TENANT_INVITE, description: "Tenant yöneticisi provision (ilk admin davet)" },
  { key: PlatformPermission.USER_VIEW, description: "Platform hesap listesi (salt-okunur)" },
  { key: PlatformPermission.USER_MANAGE, description: "Platform hesabı oluşturma ve rol atama" },
];
