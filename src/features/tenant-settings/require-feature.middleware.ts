import type { MiddlewareHandler } from "hono";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { notFound } from "../../shared/utils/errors";
import { getTenantSettings } from "./tenant-settings.cache";
import {
  TENANT_SETTING_CATALOG,
  TenantSettingKey,
  isTenantFeatureEnabled,
} from "./tenant-settings.catalog";

/**
 * Tenant özellik bayrağı kapalıysa 404 — özellik varlığını sızdırmaz (403 değil).
 * `guard()` zincirinden sonra takılır; yetki kontrolü önce çalışır.
 */
export function requireFeature(key: TenantSettingKey): MiddlewareHandler<{ Variables: RbacVariables }> {
  const def = TENANT_SETTING_CATALOG[key];
  if (def.kind !== "boolean" || !def.flagType) {
    throw new Error(`requireFeature: ${key} bir özellik bayrağı değil`);
  }

  return async (c, next) => {
    const universityId = c.req.param("universityId");
    if (!universityId) {
      throw notFound("tenantSettings.featureNotFound");
    }

    const settings = await getTenantSettings(universityId);
    if (!isTenantFeatureEnabled(settings, key)) {
      throw notFound("tenantSettings.featureNotFound");
    }

    await next();
  };
}
