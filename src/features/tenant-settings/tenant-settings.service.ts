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
  type ResolvedTenantSettings,
  isTenantSettingKey,
  parseTenantSettingValue,
  tenantSettingDefaultEquals,
} from "./tenant-settings.catalog";
import { tenantSettingsRepository } from "./tenant-settings.repository";
import { getTenantSettings, setTenantSettingsCache } from "./tenant-settings.cache";
import type { PatchTenantSettingsDTO } from "./tenant-settings.schema";

export interface TenantSettingView {
  value: number | string[];
  default: number | string[];
  kind: "integer" | "role_chain";
  min?: number;
  max?: number;
  allowedRoles?: readonly string[];
  editor: string;
  labelTr: string;
  labelEn: string;
}

export type TenantSettingsResponse = Record<string, TenantSettingView>;

function resolvedValueForKey(resolved: ResolvedTenantSettings, key: TenantSettingKey): number | string[] {
  switch (key) {
    case TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX:
      return resolved.clubPinnedAnnouncementsMax;
    case TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX:
      return resolved.universityPinnedAnnouncementsMax;
    case TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR:
      return resolved.universityAnnouncementPublishPerHour;
    case TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN:
      return resolved.clubApplicationApprovalChain;
    case TenantSettingKey.CLUB_FORMATION_SUPPORT_THRESHOLD:
      return resolved.clubFormationSupportThreshold;
    case TenantSettingKey.CLUB_FORMATION_PROPOSAL_EXPIRY_DAYS:
      return resolved.clubFormationProposalExpiryDays;
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
        kind: def.kind,
        ...(def.kind === "integer" ? { min: def.min, max: def.max } : { allowedRoles: def.allowedRoles }),
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
    const overrideMap: Partial<Record<TenantSettingKey, number | string[]>> = {};
    for (const row of overrides) {
      if (!isTenantSettingKey(row.key)) continue;
      const def = TENANT_SETTING_CATALOG[row.key];
      if (def.kind === "integer" && typeof row.value === "number") {
        overrideMap[row.key] = row.value;
      } else if (def.kind === "role_chain") {
        const chain = parseTenantSettingValue(row.key, row.value);
        if (chain) overrideMap[row.key] = chain;
      }
    }
    const resolved = mergeOverridesIntoResolved(overrideMap);
    await setTenantSettingsCache(universityId, resolved);

    return await this.getForApi(universityId);
  },
};
