/**
 * Tenant ayar kataloğu — TEK KAYNAK.
 * DB yalnızca sapmaları tutar; varsayılanlar burada.
 */

export const TenantSettingEditor = {
  TENANT: "tenant",
  PLATFORM: "platform",
} as const;

export type TenantSettingEditor = (typeof TenantSettingEditor)[keyof typeof TenantSettingEditor];

export const TenantSettingKey = {
  CLUB_PINNED_ANNOUNCEMENTS_MAX: "announcement.club.pinned.max",
  UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX: "announcement.university.pinned.max",
  UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR: "announcement.university.publish.per_hour",
} as const;

export type TenantSettingKey = (typeof TenantSettingKey)[keyof typeof TenantSettingKey];

export interface TenantSettingDefinition {
  defaultValue: number;
  min: number;
  max: number;
  editor: TenantSettingEditor;
  labelTr: string;
  labelEn: string;
}

export const TENANT_SETTING_CATALOG: Record<TenantSettingKey, TenantSettingDefinition> = {
  [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: {
    defaultValue: 3,
    min: 0,
    max: 10,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Kulüp sabitleme kotası",
    labelEn: "Club pinned announcement limit",
  },
  [TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX]: {
    defaultValue: 3,
    min: 0,
    max: 10,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Okul geneli sabitleme kotası",
    labelEn: "University-wide pinned announcement limit",
  },
  [TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR]: {
    defaultValue: 5,
    min: 1,
    max: 100,
    editor: TenantSettingEditor.PLATFORM,
    labelTr: "Okul geneli duyuru yayınlama (saat başına)",
    labelEn: "University announcement publish rate (per hour)",
  },
};

export const TENANT_SETTING_KEYS = Object.keys(TENANT_SETTING_CATALOG) as TenantSettingKey[];

export function isTenantSettingKey(key: string): key is TenantSettingKey {
  return key in TENANT_SETTING_CATALOG;
}

export function parseTenantSettingValue(key: TenantSettingKey, raw: unknown): number | null {
  if (raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  const def = TENANT_SETTING_CATALOG[key];
  if (raw < def.min || raw > def.max) return null;
  return raw;
}

/** Çözümlenmiş ayarlar — servis katmanı iç kullanımı. */
export interface ResolvedTenantSettings {
  clubPinnedAnnouncementsMax: number;
  universityPinnedAnnouncementsMax: number;
  universityAnnouncementPublishPerHour: number;
}

export function buildDefaultResolvedSettings(): ResolvedTenantSettings {
  return {
    clubPinnedAnnouncementsMax: TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX].defaultValue,
    universityPinnedAnnouncementsMax:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX].defaultValue,
    universityAnnouncementPublishPerHour:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR].defaultValue,
  };
}

export function mergeOverridesIntoResolved(
  overrides: Partial<Record<TenantSettingKey, number>>
): ResolvedTenantSettings {
  const defaults = buildDefaultResolvedSettings();
  return {
    clubPinnedAnnouncementsMax:
      overrides[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX] ?? defaults.clubPinnedAnnouncementsMax,
    universityPinnedAnnouncementsMax:
      overrides[TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX] ??
      defaults.universityPinnedAnnouncementsMax,
    universityAnnouncementPublishPerHour:
      overrides[TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR] ??
      defaults.universityAnnouncementPublishPerHour,
  };
}
