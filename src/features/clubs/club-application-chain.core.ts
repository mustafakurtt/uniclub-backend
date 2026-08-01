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

export type ApprovalChainStep =
  | { type: "role_sequential"; role: ApprovalChainRoleToken }
  | { type: "committee_majority"; committeeId: string };

export type ApplicationApprovalRow = {
  step: number;
  approverRole: string | null;
  stepKind?: "role_sequential" | "committee_majority";
  committeeId?: string | null;
  status: "pending" | "approved" | "rejected" | "revision_requested";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isApprovalChainRoleToken(value: string): value is ApprovalChainRoleToken {
  return (APPROVAL_CHAIN_ROLE_TOKENS as readonly string[]).includes(value);
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Tenant ayarı ve zincir oluşturma — string dizisi (geriye dönük) veya adımlı JSON. */
export function parseApprovalChainSteps(raw: unknown): ApprovalChainStep[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < APPROVAL_CHAIN_MIN_STEPS || raw.length > APPROVAL_CHAIN_MAX_STEPS) return null;

  const steps: ApprovalChainStep[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      if (!isApprovalChainRoleToken(item)) return null;
      steps.push({ type: "role_sequential", role: item });
      continue;
    }
    if (typeof item !== "object" || item === null) return null;
    const obj = item as Record<string, unknown>;
    if (obj.type === "role_sequential" && typeof obj.role === "string" && isApprovalChainRoleToken(obj.role)) {
      steps.push({ type: "role_sequential", role: obj.role });
      continue;
    }
    if (
      obj.type === "committee_majority" &&
      typeof obj.committeeId === "string" &&
      isUuid(obj.committeeId)
    ) {
      steps.push({ type: "committee_majority", committeeId: obj.committeeId });
      continue;
    }
    return null;
  }
  return steps;
}

/** Yalnızca rol dizisi — eski doğrulama yolları için. */
export function parseApprovalChain(raw: unknown): ApprovalChainRoleToken[] | null {
  const steps = parseApprovalChainSteps(raw);
  if (!steps) return null;
  if (steps.some((s) => s.type !== "role_sequential")) return null;
  return steps.map((s) => (s as { type: "role_sequential"; role: ApprovalChainRoleToken }).role);
}

export function approvalChainStepsEqual(a: ApprovalChainStep[], b: ApprovalChainStep[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((step, i) => {
    const other = b[i];
    if (step.type !== other.type) return false;
    if (step.type === "role_sequential" && other.type === "role_sequential") {
      return step.role === other.role;
    }
    if (step.type === "committee_majority" && other.type === "committee_majority") {
      return step.committeeId === other.committeeId;
    }
    return false;
  });
}

/** Kurul salt çoğunluğu — üye tam sayısının yarısından fazla (oy veren sayısı değil). */
export function computeCommitteeMajorityThreshold(memberCount: number): number {
  if (memberCount <= 0) return 1;
  return Math.floor(memberCount / 2) + 1;
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

export function buildApprovalInsertRows(chain: ApprovalChainStep[]) {
  return chain.map((step, index) => {
    if (step.type === "role_sequential") {
      return {
        step: index + 1,
        stepKind: "role_sequential" as const,
        approverRole: step.role,
        committeeId: null,
        status: "pending" as const,
      };
    }
    return {
      step: index + 1,
      stepKind: "committee_majority" as const,
      approverRole: null,
      committeeId: step.committeeId,
      status: "pending" as const,
    };
  });
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

export function isCommitteeMajorityStep(row: ApplicationApprovalRow): boolean {
  return row.stepKind === "committee_majority" || (row.committeeId != null && row.approverRole == null);
}
