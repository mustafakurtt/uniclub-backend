/**
 * Tenant ayar kataloğu — TEK KAYNAK.
 * DB yalnızca sapmaları tutar; varsayılanlar burada.
 */

import {
  DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN,
  APPROVAL_CHAIN_MIN_STEPS,
  APPROVAL_CHAIN_MAX_STEPS,
  APPROVAL_CHAIN_ROLE_TOKENS,
  parseApprovalChain,
} from "../clubs/club-application-chain.core";

export const TenantSettingEditor = {
  TENANT: "tenant",
  PLATFORM: "platform",
} as const;

export type TenantSettingEditor = (typeof TenantSettingEditor)[keyof typeof TenantSettingEditor];

export const TenantSettingKey = {
  CLUB_PINNED_ANNOUNCEMENTS_MAX: "announcement.club.pinned.max",
  UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX: "announcement.university.pinned.max",
  UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR: "announcement.university.publish.per_hour",
  CLUB_APPLICATION_APPROVAL_CHAIN: "club.application.approval_chain",
} as const;

export type TenantSettingKey = (typeof TenantSettingKey)[keyof typeof TenantSettingKey];

export type TenantSettingKind = "integer" | "role_chain";

export interface TenantSettingDefinition {
  kind: TenantSettingKind;
  defaultValue: number | string[];
  min?: number;
  max?: number;
  allowedRoles?: readonly string[];
  editor: TenantSettingEditor;
  labelTr: string;
  labelEn: string;
}

export const TENANT_SETTING_CATALOG: Record<TenantSettingKey, TenantSettingDefinition> = {
  [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: {
    kind: "integer",
    defaultValue: 3,
    min: 0,
    max: 10,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Kulüp sabitleme kotası",
    labelEn: "Club pinned announcement limit",
  },
  [TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX]: {
    kind: "integer",
    defaultValue: 3,
    min: 0,
    max: 10,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Okul geneli sabitleme kotası",
    labelEn: "University-wide pinned announcement limit",
  },
  [TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR]: {
    kind: "integer",
    defaultValue: 5,
    min: 1,
    max: 100,
    editor: TenantSettingEditor.PLATFORM,
    labelTr: "Okul geneli duyuru yayınlama (saat başına)",
    labelEn: "University announcement publish rate (per hour)",
  },
  [TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN]: {
    kind: "role_chain",
    defaultValue: [...DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN],
    min: APPROVAL_CHAIN_MIN_STEPS,
    max: APPROVAL_CHAIN_MAX_STEPS,
    allowedRoles: APPROVAL_CHAIN_ROLE_TOKENS,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Kulüp başvuru onay zinciri (kademe → rol)",
    labelEn: "Club application approval chain (step → role)",
  },
};

export const TENANT_SETTING_KEYS = Object.keys(TENANT_SETTING_CATALOG) as TenantSettingKey[];

export function isTenantSettingKey(key: string): key is TenantSettingKey {
  return key in TENANT_SETTING_CATALOG;
}

export function parseTenantSettingValue(key: TenantSettingKey, raw: unknown): number | string[] | null {
  const def = TENANT_SETTING_CATALOG[key];
  if (def.kind === "role_chain") {
    return parseApprovalChain(raw);
  }
  if (raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < def.min! || raw > def.max!) return null;
  return raw;
}

export function tenantSettingDefaultEquals(key: TenantSettingKey, value: number | string[]): boolean {
  const def = TENANT_SETTING_CATALOG[key];
  if (def.kind === "role_chain") {
    const defaults = def.defaultValue as string[];
    const candidate = value as string[];
    return defaults.length === candidate.length && defaults.every((v, i) => v === candidate[i]);
  }
  return value === def.defaultValue;
}

/** Çözümlenmiş ayarlar — servis katmanı iç kullanımı. */
export interface ResolvedTenantSettings {
  clubPinnedAnnouncementsMax: number;
  universityPinnedAnnouncementsMax: number;
  universityAnnouncementPublishPerHour: number;
  clubApplicationApprovalChain: string[];
}

export function buildDefaultResolvedSettings(): ResolvedTenantSettings {
  return {
    clubPinnedAnnouncementsMax: TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]
      .defaultValue as number,
    universityPinnedAnnouncementsMax:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX].defaultValue as number,
    universityAnnouncementPublishPerHour:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR].defaultValue as number,
    clubApplicationApprovalChain: [...DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN],
  };
}

export function mergeOverridesIntoResolved(
  overrides: Partial<Record<TenantSettingKey, number | string[]>>
): ResolvedTenantSettings {
  const defaults = buildDefaultResolvedSettings();
  return {
    clubPinnedAnnouncementsMax:
      (overrides[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX] as number | undefined) ??
      defaults.clubPinnedAnnouncementsMax,
    universityPinnedAnnouncementsMax:
      (overrides[TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX] as number | undefined) ??
      defaults.universityPinnedAnnouncementsMax,
    universityAnnouncementPublishPerHour:
      (overrides[TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR] as number | undefined) ??
      defaults.universityAnnouncementPublishPerHour,
    clubApplicationApprovalChain:
      (overrides[TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN] as string[] | undefined) ??
      defaults.clubApplicationApprovalChain,
  };
}
