import {
  TENANT_SETTING_CATALOG,
  TENANT_SETTING_KEYS,
  type TenantSettingKey,
} from "./tenant-settings.catalog";

/** `YYYY-MM-DD` — gün sonu UTC olarak değerlendirilir. */
export function isReleaseSunsetExpired(sunsetAfter: string, now = new Date()): boolean {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sunset = new Date(`${sunsetAfter}T23:59:59.999Z`);
  return sunset < today;
}

export function findExpiredReleaseFlags(now = new Date()): Array<{ key: TenantSettingKey; sunsetAfter: string }> {
  const expired: Array<{ key: TenantSettingKey; sunsetAfter: string }> = [];
  for (const key of TENANT_SETTING_KEYS) {
    const def = TENANT_SETTING_CATALOG[key];
    if (def.kind !== "boolean" || def.flagType !== "release") continue;
    if (!def.sunsetAfter) continue;
    if (isReleaseSunsetExpired(def.sunsetAfter, now)) {
      expired.push({ key, sunsetAfter: def.sunsetAfter });
    }
  }
  return expired;
}

export function findReleaseFlagsMissingSunset(): TenantSettingKey[] {
  const missing: TenantSettingKey[] = [];
  for (const key of TENANT_SETTING_KEYS) {
    const def = TENANT_SETTING_CATALOG[key];
    if (def.kind === "boolean" && def.flagType === "release" && !def.sunsetAfter) {
      missing.push(key);
    }
  }
  return missing;
}
