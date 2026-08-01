export const tenantSettingsMessages = {
  tr: {
    "tenantSettings.listed": "Tenant ayarları listelendi.",
    "tenantSettings.updated": "Tenant ayarları güncellendi.",
    "tenantSettings.invalidKey": "Geçersiz ayar anahtarı.",
    "tenantSettings.invalidValue": "Ayar değeri geçersiz veya sınır dışı.",
    "tenantSettings.platformKeyForbidden": "Bu ayar yalnızca platform operatörü tarafından değiştirilebilir.",
    "tenantSettings.featureNotFound": "Bulunamadı.",
  },
  en: {
    "tenantSettings.listed": "Tenant settings listed.",
    "tenantSettings.updated": "Tenant settings updated.",
    "tenantSettings.invalidKey": "Invalid setting key.",
    "tenantSettings.invalidValue": "Setting value is invalid or out of range.",
    "tenantSettings.platformKeyForbidden": "This setting can only be changed by a platform operator.",
    "tenantSettings.featureNotFound": "Not found.",
  },
};

export type TenantSettingsMessageKey = keyof (typeof tenantSettingsMessages)["tr"];
