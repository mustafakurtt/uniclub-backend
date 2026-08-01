/**
 * Kulüp başvuru onay zinciri — saf mantık (I/O yok).
 * Seed, tenant kataloğu ve durum türetme yalnızca bu modülü import etmeli;
 * Redis/RBAC zincirine bağlanmaz.
 */

/** Global RBAC rol adları + `club_approver` (club.approve yetkisi taşıyanlar). */
export const APPROVAL_CHAIN_ROLE_TOKENS = [
  "club_approver",
  "advisor",
  "student_affairs",
  "university_admin",
  "academic_affairs",
  "content_moderator",
  "auditor",
] as const;

export type ApprovalChainRoleToken = (typeof APPROVAL_CHAIN_ROLE_TOKENS)[number];

export const DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN: ApprovalChainRoleToken[] = ["club_approver"];

export const APPROVAL_CHAIN_MIN_STEPS = 1;
export const APPROVAL_CHAIN_MAX_STEPS = 3;

export type ApplicationApprovalRow = {
  step: number;
  approverRole: string | null;
  status: "pending" | "approved" | "rejected" | "revision_requested";
};

export function isApprovalChainRoleToken(value: string): value is ApprovalChainRoleToken {
  return (APPROVAL_CHAIN_ROLE_TOKENS as readonly string[]).includes(value);
}

export function parseApprovalChain(raw: unknown): ApprovalChainRoleToken[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < APPROVAL_CHAIN_MIN_STEPS || raw.length > APPROVAL_CHAIN_MAX_STEPS) return null;
  const parsed: ApprovalChainRoleToken[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !isApprovalChainRoleToken(item)) return null;
    parsed.push(item);
  }
  return parsed;
}

/** Özet durum — tek yerde türetilir. */
export function deriveApplicationStatus(
  approvals: ApplicationApprovalRow[]
): "pending" | "approved" | "rejected" | "revision_requested" {
  if (approvals.some((a) => a.status === "rejected")) return "rejected";
  if (approvals.length > 0 && approvals.every((a) => a.status === "approved")) return "approved";
  if (approvals.some((a) => a.status === "revision_requested")) return "revision_requested";
  return "pending";
}

/** Karar bekleyen ilk adım (önceki adımlar onaylı olmalı). */
export function findCurrentApprovalStep(
  approvals: ApplicationApprovalRow[]
): ApplicationApprovalRow | null {
  const sorted = [...approvals].sort((a, b) => a.step - b.step);
  for (const row of sorted) {
    if (row.status === "rejected") return null;
    if (row.status === "revision_requested") return null;
    if (row.status === "pending") {
      const priorOk = sorted.filter((s) => s.step < row.step).every((s) => s.status === "approved");
      return priorOk ? row : null;
    }
  }
  return null;
}

/** Revizyon bekleyen kademe (öğrenci yeniden gönderecek). */
export function findRevisionRequestedStep(
  approvals: ApplicationApprovalRow[]
): ApplicationApprovalRow | null {
  return approvals.find((a) => a.status === "revision_requested") ?? null;
}

export function buildApprovalInsertRows(chain: ApprovalChainRoleToken[]) {
  return chain.map((role, index) => ({
    step: index + 1,
    approverRole: role,
    status: "pending" as const,
  }));
}

/**
 * Tek adımlı eski satırlarda approverRole çoğu zaman "advisor" yazılmıştı;
 * karar yetkisi route guard (club.approve) üzerinden geliyordu — çok kademede advisor gerçek karar vericidir.
 */
export function isLegacySingleStepAdvisorRole(
  approverRole: string | null,
  approvalStepCount: number
): boolean {
  return approverRole === "advisor" && approvalStepCount === 1;
}
