import { hasTenantScopeBypass } from "../../core/rbac/tenant-scope";
import type { AuthzContext } from "../../core/rbac/rbac.types";
import { PlatformPermission } from "../platform/platform.permissions";
import { badRequest, forbidden } from "../../shared/utils/errors";
import {
  TENANT_SETTING_CATALOG,
  TENANT_SETTING_KEYS,
  TenantSettingEditor,
  TenantSettingKey,
  type ResolvedTenantSettings,
  isTenantSettingKey,
  parseTenantSettingValue,
  mergeOverridesIntoResolved,
} from "./tenant-settings.catalog";
import { tenantSettingsRepository } from "./tenant-settings.repository";
import { getTenantSettings, setTenantSettingsCache } from "./tenant-settings.cache";
import type { PatchTenantSettingsDTO } from "./tenant-settings.schema";

export interface TenantSettingView {
  value: number;
  default: number;
  min: number;
  max: number;
  editor: string;
  labelTr: string;
  labelEn: string;
}

export type TenantSettingsResponse = Record<string, TenantSettingView>;

function resolvedValueForKey(resolved: ResolvedTenantSettings, key: TenantSettingKey): number {
  switch (key) {
    case TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX:
      return resolved.clubPinnedAnnouncementsMax;
    case TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX:
      return resolved.universityPinnedAnnouncementsMax;
    case TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR:
      return resolved.universityAnnouncementPublishPerHour;
  }
}

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
        value: resolvedValueForKey(resolved, key),
        default: def.defaultValue,
        min: def.min,
        max: def.max,
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

      const def = TENANT_SETTING_CATALOG[key];
      if (parsed === def.defaultValue) {
        await tenantSettingsRepository.deleteOverride(universityId, key);
      } else {
        await tenantSettingsRepository.upsertOverride(universityId, key, parsed, actorId);
      }
    }

    const overrides = await tenantSettingsRepository.listOverrides(universityId);
    const overrideMap: Partial<Record<TenantSettingKey, number>> = {};
    for (const row of overrides) {
      if (!isTenantSettingKey(row.key)) continue;
      if (typeof row.value !== "number") continue;
      overrideMap[row.key] = row.value;
    }
    const resolved = mergeOverridesIntoResolved(overrideMap);
    await setTenantSettingsCache(universityId, resolved);

    return await this.getForApi(universityId);
  },
};
