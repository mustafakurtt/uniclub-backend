import { cache } from "../../shared/cache/cache.client";
import { logger } from "../../shared/logger/logger";
import {
  buildDefaultResolvedSettings,
  mergeOverridesIntoResolved,
  type ResolvedTenantSettings,
  type TenantSettingKey,
  isTenantSettingKey,
} from "./tenant-settings.catalog";
import { tenantSettingsRepository } from "./tenant-settings.repository";

const log = logger.child({ module: "tenant-settings.cache" });

const tenantSettingsCache = cache.namespace("tenant:settings");
const TTL_SECONDS = 300;

/**
 * Tenant ayarları cache — fail-open: Redis/DB hatasında koddaki varsayılanlara düşer.
 * (tenant-status cache fail-closed çünkü güvenlik kapısı; bu politika tuşu.)
 */
export async function getTenantSettings(universityId: string): Promise<ResolvedTenantSettings> {
  try {
    return await tenantSettingsCache.getOrSet(
      universityId,
      async () => await loadResolvedFromDb(universityId),
      { ttlSeconds: TTL_SECONDS }
    );
  } catch (err) {
    log.warn({ err, universityId }, "tenant ayarları okunamadı; varsayılanlara düşülüyor");
    return buildDefaultResolvedSettings();
  }
}

export async function setTenantSettingsCache(
  universityId: string,
  settings: ResolvedTenantSettings
): Promise<void> {
  try {
    await tenantSettingsCache.set(universityId, settings, { ttlSeconds: TTL_SECONDS });
  } catch (err) {
    log.warn({ err, universityId }, "tenant ayarları cache güncellenemedi");
  }
}

async function loadResolvedFromDb(universityId: string): Promise<ResolvedTenantSettings> {
  const rows = await tenantSettingsRepository.listOverrides(universityId);
  const overrides: Partial<Record<TenantSettingKey, number>> = {};
  for (const row of rows) {
    if (!isTenantSettingKey(row.key)) continue;
    if (typeof row.value !== "number" || !Number.isInteger(row.value)) continue;
    overrides[row.key] = row.value;
  }
  return mergeOverridesIntoResolved(overrides);
}
