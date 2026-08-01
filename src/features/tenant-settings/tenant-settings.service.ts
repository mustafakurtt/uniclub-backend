import { hasTenantScopeBypass } from "../../core/rbac/tenant-scope";
import type { AuthzContext } from "../../core/rbac/rbac.types";
import { PlatformPermission } from "../platform/platform.permissions";
import { badRequest, forbidden } from "../../shared/utils/errors";
import {
  TENANT_SETTING_CATALOG,
  TENANT_SETTING_KEYS,
  TenantSettingEditor,
  TenantSettingKey,
  mergeOverridesIntoResolved,
  getResolvedSettingValue,
  isTenantSettingKey,
  parseTenantSettingValue,
  tenantSettingDefaultEquals,
  type TenantSettingStoredValue,
} from "./tenant-settings.catalog";
import type { ApprovalChainStep } from "../clubs/club-application-chain.core";
import { tenantSettingsRepository } from "./tenant-settings.repository";
import { getTenantSettings, setTenantSettingsCache } from "./tenant-settings.cache";
import type { PatchTenantSettingsDTO } from "./tenant-settings.schema";

export interface TenantSettingView {
  value: TenantSettingStoredValue;
  default: TenantSettingStoredValue;
  kind: "integer" | "role_chain" | "boolean" | "checklist";
  min?: number;
  max?: number;
  allowedRoles?: readonly string[];
  flagType?: "entitlement" | "release";
  sunsetAfter?: string;
  editor: string;
  labelTr: string;
  labelEn: string;
}

export type TenantSettingsResponse = Record<string, TenantSettingView>;

function canEditSetting(key: TenantSettingKey, authz: AuthzContext): boolean {
  const def = TENANT_SETTING_CATALOG[key];
  if (def.editor === TenantSettingEditor.TENANT) return true;
  return hasTenantScopeBypass(authz) || authz.permissions.includes(PlatformPermission.TENANT_MANAGE);
}

export const tenantSettingsService = {
  async getResolved(universityId: string) {
    return await getTenantSettings(universityId);
  },

  async getForApi(universityId: string): Promise<TenantSettingsResponse> {
    const resolved = await getTenantSettings(universityId);
    const response: TenantSettingsResponse = {};
    for (const key of TENANT_SETTING_KEYS) {
      const def = TENANT_SETTING_CATALOG[key];
      response[key] = {
        value: getResolvedSettingValue(resolved, key),
        default: def.defaultValue,
        kind: def.kind,
        ...(def.kind === "integer" ? { min: def.min, max: def.max } : {}),
        ...(def.kind === "role_chain" ? { allowedRoles: def.allowedRoles } : {}),
        ...(def.kind === "boolean"
          ? {
              flagType: def.flagType,
              ...(def.flagType === "release" ? { sunsetAfter: def.sunsetAfter } : {}),
            }
          : {}),
        editor: def.editor,
        labelTr: def.labelTr,
        labelEn: def.labelEn,
      };
    }
    return response;
  },

  async patch(
    universityId: string,
    actorId: string,
    authz: AuthzContext,
    data: PatchTenantSettingsDTO
  ): Promise<TenantSettingsResponse> {
    for (const [rawKey, rawValue] of Object.entries(data.settings)) {
      if (!isTenantSettingKey(rawKey)) {
        throw badRequest("tenantSettings.invalidKey");
      }
      const key = rawKey as TenantSettingKey;

      if (!canEditSetting(key, authz)) {
        throw forbidden("tenantSettings.platformKeyForbidden");
      }

      if (rawValue === null) {
        await tenantSettingsRepository.deleteOverride(universityId, key);
        continue;
      }

      const parsed = parseTenantSettingValue(key, rawValue);
      if (parsed === null) {
        throw badRequest("tenantSettings.invalidValue");
      }

      if (tenantSettingDefaultEquals(key, parsed)) {
        await tenantSettingsRepository.deleteOverride(universityId, key);
      } else {
        await tenantSettingsRepository.upsertOverride(universityId, key, parsed, actorId);
      }
    }

    const overrides = await tenantSettingsRepository.listOverrides(universityId);
    const overrideMap: Partial<Record<TenantSettingKey, TenantSettingStoredValue>> = {};
    for (const row of overrides) {
      if (!isTenantSettingKey(row.key)) continue;
      const def = TENANT_SETTING_CATALOG[row.key];
      if (def.kind === "integer" && typeof row.value === "number") {
        overrideMap[row.key] = row.value;
      } else if (def.kind === "boolean" && typeof row.value === "boolean") {
        overrideMap[row.key] = row.value;
      } else if (def.kind === "role_chain") {
        const chain = parseTenantSettingValue(row.key, row.value);
        if (Array.isArray(chain) && chain.length > 0) {
          overrideMap[row.key] = chain as ApprovalChainStep[];
        }
      } else if (def.kind === "checklist") {
        const checklist = parseTenantSettingValue(row.key, row.value);
        if (Array.isArray(checklist) && checklist[0] && typeof checklist[0] === "object") {
          overrideMap[row.key] = checklist as import("../clubs/application-review-checklist.core").ApplicationReviewChecklistItemDef[];
        }
      }
    }
    const resolved = mergeOverridesIntoResolved(overrideMap);
    await setTenantSettingsCache(universityId, resolved);

    return await this.getForApi(universityId);
  },
};
