export const TenantSettingsPermission = {
  MANAGE: "university.settings.manage",
} as const;

export type TenantSettingsPermission =
  (typeof TenantSettingsPermission)[keyof typeof TenantSettingsPermission];

export const TENANT_SETTINGS_PERMISSION_CATALOG: {
  key: TenantSettingsPermission;
  description: string;
}[] = [
  {
    key: TenantSettingsPermission.MANAGE,
    description: "Tenant yapılandırma ayarlarını görüntüleme ve güncelleme",
  },
];
