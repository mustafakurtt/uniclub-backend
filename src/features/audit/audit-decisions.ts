import { and, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { auditLogs } from "../../db/schema";

/** Karar niteliğindeki sabit `action` değerleri (manuel auditService.record). */
export const DECISION_AUDIT_ACTIONS = [
  "club.application.committee_vote.approve",
  "club.application.committee_vote.reject",
  "club.application.appeal.upheld",
  "club.application.appeal.dismissed",
  "club.advisor.invited",
  "club.advisor.invitation.cancelled",
  "club.advisor.invitation.accepted",
  "club.advisor.invitation.declined",
  "club.advisor.withdrawn",
  "club.advisor.removed",
  "club.approve",
] as const;

const APPLICATION_DECISION_PATH_SUFFIXES = [
  "/approve",
  "/reject",
  "/request-revision",
  "/committee-vote",
  "/appeal/review",
] as const;

/**
 * Denetim akışında yalnızca kurumsal karar satırlarını süzer.
 * `application.view` / `club.update` guard kayıtları path + metadata ile eşleştirilir;
 * rutin profil güncellemeleri ve kontrol listesi işaretleri dahil edilmez.
 */
export function decisionAuditWhereClause(): SQL {
  const applicationViewPaths = APPLICATION_DECISION_PATH_SUFFIXES.map((suffix) =>
    like(auditLogs.path, `%${suffix}`)
  );

  return or(
    inArray(auditLogs.action, [...DECISION_AUDIT_ACTIONS]),
    and(eq(auditLogs.action, "application.view"), or(...applicationViewPaths)),
    and(
      eq(auditLogs.action, "club.update"),
      like(auditLogs.path, "%/status"),
      sql`(${auditLogs.metadata} -> 'body' ->> 'status') IN ('archived', 'rejected')`
    )
  )!;
}

type AuditLogRow = {
  action: string;
  path: string;
  metadata: Record<string, unknown> | null;
};

/** Türkçe okunur karar özeti — UI kart metni. */
export function resolveDecisionActionLabel(log: AuditLogRow): string {
  if (log.action === "application.view") {
    if (log.path.endsWith("/approve")) return "Kulüp başvurusu onaylandı";
    if (log.path.endsWith("/reject")) return "Kulüp başvurusu reddedildi";
    if (log.path.endsWith("/request-revision")) return "Kulüp başvurusu için revizyon istendi";
    if (log.path.endsWith("/committee-vote")) return "Kurul oyu kaydedildi";
    if (log.path.endsWith("/appeal/review")) return "Başvuru itirazı incelendi";
  }

  if (log.action === "club.update" && log.path.includes("/status")) {
    const status = readMetadataField(log.metadata, "status");
    if (status === "archived") return "Kulüp arşivlendi (kapatıldı)";
    if (status === "rejected") return "Kulüp reddedildi";
  }

  const labels: Record<string, string> = {
    "club.application.committee_vote.approve": "Kurul oyu: onay",
    "club.application.committee_vote.reject": "Kurul oyu: ret",
    "club.application.appeal.upheld": "Başvuru itirazı kabul edildi",
    "club.application.appeal.dismissed": "Başvuru itirazı reddedildi",
    "club.advisor.invited": "Danışman daveti gönderildi",
    "club.advisor.invitation.cancelled": "Danışman daveti iptal edildi",
    "club.advisor.invitation.accepted": "Danışman daveti kabul edildi",
    "club.advisor.invitation.declined": "Danışman daveti reddedildi",
    "club.advisor.withdrawn": "Danışmanlıktan çekilme",
    "club.advisor.removed": "Danışman kaldırıldı",
    "club.approve": "Kulüp onaylandı",
  };

  return labels[log.action] ?? log.action;
}

/** Gerekçe / not alanı — metadata ve body içinden ilk dolu metin. */
export function extractDecisionNote(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;

  const body = metadata.body as Record<string, unknown> | undefined;
  const candidates = [
    metadata.note,
    metadata.reason,
    metadata.reviewNote,
    metadata.rejectionNote,
    metadata.declineReason,
    body?.note,
    body?.reason,
    body?.rejectionNote,
    body?.reviewNote,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readMetadataField(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata) return null;
  const body = metadata.body as Record<string, unknown> | undefined;
  const direct = metadata[key];
  const nested = body?.[key];
  const value = typeof direct === "string" ? direct : typeof nested === "string" ? nested : null;
  return value?.trim() || null;
}
