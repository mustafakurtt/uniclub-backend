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
  parseApprovalChainSteps,
  approvalChainStepsEqual,
  type ApprovalChainStep,
} from "../clubs/club-application-chain.core";
import {
  DEFAULT_APPLICATION_REVIEW_CHECKLIST,
  parseReviewChecklist,
  reviewChecklistEquals,
  type ApplicationReviewChecklistItemDef,
} from "../clubs/application-review-checklist.core";

export const TenantSettingEditor = {
  TENANT: "tenant",
  PLATFORM: "platform",
} as const;

export type TenantSettingEditor = (typeof TenantSettingEditor)[keyof typeof TenantSettingEditor];

export const TenantSettingFlagType = {
  ENTITLEMENT: "entitlement",
  RELEASE: "release",
} as const;

export type TenantSettingFlagType = (typeof TenantSettingFlagType)[keyof typeof TenantSettingFlagType];

export const TenantSettingKey = {
  CLUB_PINNED_ANNOUNCEMENTS_MAX: "announcement.club.pinned.max",
  UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX: "announcement.university.pinned.max",
  UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR: "announcement.university.publish.per_hour",
  CLUB_APPLICATION_APPROVAL_CHAIN: "club.application.approval_chain",
  /** SKS inceleme kontrol listesi maddeleri (tenant kataloğu). */
  CLUB_APPLICATION_REVIEW_CHECKLIST: "club.application.review_checklist",
  /** Zorunlu kontrol listesi maddeleri işaretlenmeden onay engeli — varsayılan kapalı. */
  CLUB_APPLICATION_REQUIRE_CHECKLIST_FOR_APPROVAL: "club.application.require_checklist_for_approval",
  /** Ret sonrası itiraz süresi (gün). */
  CLUB_APPLICATION_APPEAL_PERIOD_DAYS: "club.application.appeal_period_days",
  /** 0 = destek toplama kapalı (doğrudan başvuru). >0 = minimum destek sayısı. */
  CLUB_FORMATION_SUPPORT_THRESHOLD: "club.formation.support_threshold",
  CLUB_FORMATION_PROPOSAL_EXPIRY_DAYS: "club.formation.proposal_expiry_days",
  /** Danışman davetinin geçerlilik süresi (gün). */
  CLUB_ADVISOR_INVITATION_EXPIRY_DAYS: "club.advisor.invitation_expiry_days",
  /** Genel kurul yeter sayısı (onaylı üye yüzdesi). */
  CLUB_GENERAL_MEETING_QUORUM_PERCENT: "club.general_meeting.quorum_percent",
  /** Genel kurul karar çoğunluğu (katılan üye yüzdesi). */
  CLUB_GENERAL_MEETING_MAJORITY_PERCENT: "club.general_meeting.majority_percent",
  /** Kurumsal rapor dışa aktarma (T4.5) — entitlement bayrağı; varsayılan kapalı. */
  UNIVERSITY_EXPORT_ENABLED: "university.export.enabled",
  /** PDF resmî belgeler (T4.5 v2) — release bayrağı; pilot sonrası kaldırılacak. */
  UNIVERSITY_EXPORT_PDF_ENABLED: "university.export.pdf.enabled",
  /** Üniversiteler arası etkinlik keşfi (T10.4) — entitlement; varsayılan kapalı. */
  UNIVERSITY_INTER_UNIVERSITY_ENABLED: "university.inter_university.enabled",
} as const;

export type TenantSettingKey = (typeof TenantSettingKey)[keyof typeof TenantSettingKey];

export type TenantSettingKind = "integer" | "role_chain" | "boolean" | "checklist";

type TenantSettingDefinitionBase = {
  editor: TenantSettingEditor;
  labelTr: string;
  labelEn: string;
};

export type TenantSettingDefinition =
  | (TenantSettingDefinitionBase & {
      kind: "integer";
      defaultValue: number;
      min: number;
      max: number;
    })
  | (TenantSettingDefinitionBase & {
      kind: "role_chain";
      defaultValue: string[];
      min: number;
      max: number;
      allowedRoles: readonly string[];
    })
  | (TenantSettingDefinitionBase & {
      kind: "boolean";
      defaultValue: boolean;
      flagType: "entitlement";
    })
  | (TenantSettingDefinitionBase & {
      kind: "boolean";
      defaultValue: boolean;
      flagType: "release";
      sunsetAfter: string;
    })
  | (TenantSettingDefinitionBase & {
      kind: "checklist";
      defaultValue: ApplicationReviewChecklistItemDef[];
    });

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
  [TenantSettingKey.CLUB_APPLICATION_REVIEW_CHECKLIST]: {
    kind: "checklist",
    defaultValue: [...DEFAULT_APPLICATION_REVIEW_CHECKLIST],
    editor: TenantSettingEditor.TENANT,
    labelTr: "Kulüp başvuru inceleme kontrol listesi",
    labelEn: "Club application review checklist",
  },
  [TenantSettingKey.CLUB_APPLICATION_REQUIRE_CHECKLIST_FOR_APPROVAL]: {
    kind: "boolean",
    defaultValue: false,
    flagType: "entitlement",
    editor: TenantSettingEditor.TENANT,
    labelTr: "Onay için zorunlu kontrol listesi kilidi",
    labelEn: "Require checklist completion before approval",
  },
  [TenantSettingKey.CLUB_APPLICATION_APPEAL_PERIOD_DAYS]: {
    kind: "integer",
    defaultValue: 14,
    min: 1,
    max: 60,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Başvuru ret itiraz süresi (gün)",
    labelEn: "Application rejection appeal period (days)",
  },
  [TenantSettingKey.CLUB_FORMATION_SUPPORT_THRESHOLD]: {
    kind: "integer",
    defaultValue: 0,
    min: 0,
    max: 500,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Kulüp kuruluşu dijital destek eşiği (0 = kapalı)",
    labelEn: "Club formation digital support threshold (0 = disabled)",
  },
  [TenantSettingKey.CLUB_FORMATION_PROPOSAL_EXPIRY_DAYS]: {
    kind: "integer",
    defaultValue: 90,
    min: 7,
    max: 180,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Kuruluş önerisi destek süresi (gün)",
    labelEn: "Formation proposal support window (days)",
  },
  [TenantSettingKey.CLUB_ADVISOR_INVITATION_EXPIRY_DAYS]: {
    kind: "integer",
    defaultValue: 14,
    min: 3,
    max: 60,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Danışman davet geçerlilik süresi (gün)",
    labelEn: "Advisor invitation validity (days)",
  },
  [TenantSettingKey.CLUB_GENERAL_MEETING_QUORUM_PERCENT]: {
    kind: "integer",
    defaultValue: 50,
    min: 1,
    max: 100,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Genel kurul yeter sayısı (onaylı üye %)",
    labelEn: "General meeting quorum (approved member %)",
  },
  [TenantSettingKey.CLUB_GENERAL_MEETING_MAJORITY_PERCENT]: {
    kind: "integer",
    defaultValue: 50,
    min: 1,
    max: 100,
    editor: TenantSettingEditor.TENANT,
    labelTr: "Genel kurul karar çoğunluğu (katılan üye %)",
    labelEn: "General meeting decision majority (attendee %)",
  },
  [TenantSettingKey.UNIVERSITY_EXPORT_ENABLED]: {
    kind: "boolean",
    defaultValue: false,
    flagType: "entitlement",
    editor: TenantSettingEditor.PLATFORM,
    labelTr: "Kurumsal rapor dışa aktarma",
    labelEn: "Institutional report export",
  },
  [TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED]: {
    kind: "boolean",
    defaultValue: false,
    flagType: "release",
    sunsetAfter: "2026-11-01",
    editor: TenantSettingEditor.PLATFORM,
    labelTr: "PDF resmî belge dışa aktarma",
    labelEn: "PDF official document export",
  },
  [TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED]: {
    kind: "boolean",
    defaultValue: false,
    flagType: "entitlement",
    editor: TenantSettingEditor.TENANT,
    labelTr: "Üniversiteler arası etkinlik keşfi",
    labelEn: "Inter-university activity discovery",
  },
};

export const TENANT_SETTING_KEYS = Object.keys(TENANT_SETTING_CATALOG) as TenantSettingKey[];

export function isTenantSettingKey(key: string): key is TenantSettingKey {
  return key in TENANT_SETTING_CATALOG;
}

export type TenantSettingStoredValue =
  | number
  | string[]
  | boolean
  | ApplicationReviewChecklistItemDef[]
  | ApprovalChainStep[];

export function parseTenantSettingValue(
  key: TenantSettingKey,
  raw: unknown
): TenantSettingStoredValue | null {
  const def = TENANT_SETTING_CATALOG[key];
  if (def.kind === "role_chain") {
    return parseApprovalChainSteps(raw);
  }
  if (def.kind === "checklist") {
    return parseReviewChecklist(raw);
  }
  if (def.kind === "boolean") {
    return typeof raw === "boolean" ? raw : null;
  }
  if (raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < def.min || raw > def.max) return null;
  return raw;
}

export function tenantSettingDefaultEquals(
  key: TenantSettingKey,
  value: TenantSettingStoredValue
): boolean {
  const def = TENANT_SETTING_CATALOG[key];
  if (def.kind === "role_chain") {
    const defaults = parseApprovalChainSteps(def.defaultValue);
    const candidate = value as ApprovalChainStep[];
    if (!defaults) return false;
    return approvalChainStepsEqual(defaults, candidate);
  }
  if (def.kind === "checklist") {
    return reviewChecklistEquals(def.defaultValue, value as ApplicationReviewChecklistItemDef[]);
  }
  return value === def.defaultValue;
}

/** Çözümlenmiş ayarlar — servis katmanı iç kullanımı. */
export interface ResolvedTenantSettings {
  clubPinnedAnnouncementsMax: number;
  universityPinnedAnnouncementsMax: number;
  universityAnnouncementPublishPerHour: number;
  clubApplicationApprovalChain: ApprovalChainStep[];
  clubApplicationReviewChecklist: ApplicationReviewChecklistItemDef[];
  clubApplicationRequireChecklistForApproval: boolean;
  clubApplicationAppealPeriodDays: number;
  clubFormationSupportThreshold: number;
  clubFormationProposalExpiryDays: number;
  clubAdvisorInvitationExpiryDays: number;
  clubGeneralMeetingQuorumPercent: number;
  clubGeneralMeetingMajorityPercent: number;
  universityExportEnabled: boolean;
  universityExportPdfEnabled: boolean;
  universityInterUniversityEnabled: boolean;
}

export function buildDefaultResolvedSettings(): ResolvedTenantSettings {
  return {
    clubPinnedAnnouncementsMax:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX].defaultValue as number,
    universityPinnedAnnouncementsMax:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX].defaultValue as number,
    universityAnnouncementPublishPerHour:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR].defaultValue as number,
    clubApplicationApprovalChain: parseApprovalChainSteps(DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN)!,
    clubApplicationReviewChecklist: [...DEFAULT_APPLICATION_REVIEW_CHECKLIST],
    clubApplicationRequireChecklistForApproval:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_APPLICATION_REQUIRE_CHECKLIST_FOR_APPROVAL]
        .defaultValue as boolean,
    clubApplicationAppealPeriodDays:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_APPLICATION_APPEAL_PERIOD_DAYS].defaultValue as number,
    clubFormationSupportThreshold:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_FORMATION_SUPPORT_THRESHOLD].defaultValue as number,
    clubFormationProposalExpiryDays:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_FORMATION_PROPOSAL_EXPIRY_DAYS].defaultValue as number,
    clubAdvisorInvitationExpiryDays:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_ADVISOR_INVITATION_EXPIRY_DAYS].defaultValue as number,
    clubGeneralMeetingQuorumPercent:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_GENERAL_MEETING_QUORUM_PERCENT].defaultValue as number,
    clubGeneralMeetingMajorityPercent:
      TENANT_SETTING_CATALOG[TenantSettingKey.CLUB_GENERAL_MEETING_MAJORITY_PERCENT].defaultValue as number,
    universityExportEnabled:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_EXPORT_ENABLED].defaultValue as boolean,
    universityExportPdfEnabled:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED].defaultValue as boolean,
    universityInterUniversityEnabled:
      TENANT_SETTING_CATALOG[TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED].defaultValue as boolean,
  };
}

export function mergeOverridesIntoResolved(
  overrides: Partial<Record<TenantSettingKey, TenantSettingStoredValue>>
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
      (overrides[TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN] as ApprovalChainStep[] | undefined) ??
      defaults.clubApplicationApprovalChain,
    clubApplicationReviewChecklist:
      (overrides[TenantSettingKey.CLUB_APPLICATION_REVIEW_CHECKLIST] as
        | ApplicationReviewChecklistItemDef[]
        | undefined) ?? defaults.clubApplicationReviewChecklist,
    clubApplicationRequireChecklistForApproval:
      (overrides[TenantSettingKey.CLUB_APPLICATION_REQUIRE_CHECKLIST_FOR_APPROVAL] as boolean | undefined) ??
      defaults.clubApplicationRequireChecklistForApproval,
    clubApplicationAppealPeriodDays:
      (overrides[TenantSettingKey.CLUB_APPLICATION_APPEAL_PERIOD_DAYS] as number | undefined) ??
      defaults.clubApplicationAppealPeriodDays,
    clubFormationSupportThreshold:
      (overrides[TenantSettingKey.CLUB_FORMATION_SUPPORT_THRESHOLD] as number | undefined) ??
      defaults.clubFormationSupportThreshold,
    clubFormationProposalExpiryDays:
      (overrides[TenantSettingKey.CLUB_FORMATION_PROPOSAL_EXPIRY_DAYS] as number | undefined) ??
      defaults.clubFormationProposalExpiryDays,
    clubAdvisorInvitationExpiryDays:
      (overrides[TenantSettingKey.CLUB_ADVISOR_INVITATION_EXPIRY_DAYS] as number | undefined) ??
      defaults.clubAdvisorInvitationExpiryDays,
    clubGeneralMeetingQuorumPercent:
      (overrides[TenantSettingKey.CLUB_GENERAL_MEETING_QUORUM_PERCENT] as number | undefined) ??
      defaults.clubGeneralMeetingQuorumPercent,
    clubGeneralMeetingMajorityPercent:
      (overrides[TenantSettingKey.CLUB_GENERAL_MEETING_MAJORITY_PERCENT] as number | undefined) ??
      defaults.clubGeneralMeetingMajorityPercent,
    universityExportEnabled:
      (overrides[TenantSettingKey.UNIVERSITY_EXPORT_ENABLED] as boolean | undefined) ??
      defaults.universityExportEnabled,
    universityExportPdfEnabled:
      (overrides[TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED] as boolean | undefined) ??
      defaults.universityExportPdfEnabled,
    universityInterUniversityEnabled:
      (overrides[TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED] as boolean | undefined) ??
      defaults.universityInterUniversityEnabled,
  };
}

export function getResolvedSettingValue(
  resolved: ResolvedTenantSettings,
  key: TenantSettingKey
): TenantSettingStoredValue {
  switch (key) {
    case TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX:
      return resolved.clubPinnedAnnouncementsMax;
    case TenantSettingKey.UNIVERSITY_PINNED_ANNOUNCEMENTS_MAX:
      return resolved.universityPinnedAnnouncementsMax;
    case TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR:
      return resolved.universityAnnouncementPublishPerHour;
    case TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN:
      return resolved.clubApplicationApprovalChain;
    case TenantSettingKey.CLUB_APPLICATION_REVIEW_CHECKLIST:
      return resolved.clubApplicationReviewChecklist;
    case TenantSettingKey.CLUB_APPLICATION_REQUIRE_CHECKLIST_FOR_APPROVAL:
      return resolved.clubApplicationRequireChecklistForApproval;
    case TenantSettingKey.CLUB_APPLICATION_APPEAL_PERIOD_DAYS:
      return resolved.clubApplicationAppealPeriodDays;
    case TenantSettingKey.CLUB_FORMATION_SUPPORT_THRESHOLD:
      return resolved.clubFormationSupportThreshold;
    case TenantSettingKey.CLUB_FORMATION_PROPOSAL_EXPIRY_DAYS:
      return resolved.clubFormationProposalExpiryDays;
    case TenantSettingKey.CLUB_ADVISOR_INVITATION_EXPIRY_DAYS:
      return resolved.clubAdvisorInvitationExpiryDays;
    case TenantSettingKey.CLUB_GENERAL_MEETING_QUORUM_PERCENT:
      return resolved.clubGeneralMeetingQuorumPercent;
    case TenantSettingKey.CLUB_GENERAL_MEETING_MAJORITY_PERCENT:
      return resolved.clubGeneralMeetingMajorityPercent;
    case TenantSettingKey.UNIVERSITY_EXPORT_ENABLED:
      return resolved.universityExportEnabled;
    case TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED:
      return resolved.universityExportPdfEnabled;
    case TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED:
      return resolved.universityInterUniversityEnabled;
  }
}

/** Boolean özellik bayrağı açık mı? (non-boolean anahtarlar için true döner.) */
export function isTenantFeatureEnabled(resolved: ResolvedTenantSettings, key: TenantSettingKey): boolean {
  const def = TENANT_SETTING_CATALOG[key];
  if (def.kind !== "boolean") return true;
  return getResolvedSettingValue(resolved, key) as boolean;
}
