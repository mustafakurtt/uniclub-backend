import { cache } from "../../shared/cache/cache.client";
import { logger } from "../../shared/logger/logger";
import {
  buildDefaultResolvedSettings,
  mergeOverridesIntoResolved,
  type ResolvedTenantSettings,
  type TenantSettingKey,
  isTenantSettingKey,
  TENANT_SETTING_CATALOG,
} from "./tenant-settings.catalog";
import { parseApprovalChain } from "../clubs/club-application-chain.core";
import { tenantSettingsRepository } from "./tenant-settings.repository";

const log = logger.child({ module: "tenant-settings.cache" });

const tenantSettingsCache = cache.namespace("tenant:settings");
const TTL_SECONDS = 300;

/**
 * Tenant ayarları cache — fail-open: Redis/DB hatasında koddaki varsayılanlara düşer.
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

/** DB'ye doğrudan yazıldığında (seed vb.) stale cache'i temizler. */
export async function invalidateTenantSettingsCache(universityId: string): Promise<void> {
  try {
    await tenantSettingsCache.delete(universityId);
  } catch (err) {
    log.warn({ err, universityId }, "tenant ayarları cache temizlenemedi");
  }
}

async function loadResolvedFromDb(universityId: string): Promise<ResolvedTenantSettings> {
  const rows = await tenantSettingsRepository.listOverrides(universityId);
  const overrides: Partial<Record<TenantSettingKey, number | string[] | boolean>> = {};
  for (const row of rows) {
    if (!isTenantSettingKey(row.key)) continue;
    const def = TENANT_SETTING_CATALOG[row.key];
    if (def.kind === "integer" && typeof row.value === "number" && Number.isInteger(row.value)) {
      overrides[row.key] = row.value;
    } else if (def.kind === "boolean" && typeof row.value === "boolean") {
      overrides[row.key] = row.value;
    } else if (def.kind === "role_chain") {
      const chain = parseApprovalChain(row.value);
      if (chain) overrides[row.key] = chain;
    }
  }
  return mergeOverridesIntoResolved(overrides);
}
