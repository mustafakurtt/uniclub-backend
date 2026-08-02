/**
 * Kulüp başvuru onay zinciri — çalışma zamanı yetki (istek yolu).
 * Saf mantık: `club-application-chain.core.ts`.
 */

import { ClubPermission } from "./clubs.permissions";
import { resolveAuthz } from "../../shared/rbac/rbac.cache";
import { clubApplicationReviewRepository } from "./club-application-review.repository";
import { badRequest, forbidden } from "../../shared/utils/errors";
import {
  type ApplicationApprovalRow,
  isApprovalChainRoleToken,
  isLegacySingleStepAdvisorRole,
} from "./club-application-chain.core";

export * from "./club-application-chain.core";

export async function canActorDecideApprovalStep(
  actorUserId: string,
  approverRole: string | null,
  approvalStepCount: number
): Promise<boolean> {
  if (!approverRole) return false;

  const authz = await resolveAuthz(actorUserId);
  const hasClubApprove = authz.permissions.includes(ClubPermission.APPROVE);

  if (approverRole === "club_approver") {
    return hasClubApprove;
  }

  // Tek adımlı eski "advisor" satırları + bilinmeyen belirteçler → club.approve (dağıtım öncesi veri).
  if (isLegacySingleStepAdvisorRole(approverRole, approvalStepCount)) {
    return hasClubApprove;
  }
  if (!isApprovalChainRoleToken(approverRole)) {
    return hasClubApprove;
  }

  return await clubApplicationReviewRepository.userHasRole(actorUserId, approverRole);
}

/**
 * Mevcut adım için yetki yoksa: ilerideki bir adımda yetkili → sıra ihlali (400);
 * zincirde hiç yetkisi yok → 403.
 */
export async function assertActorCanDecideCurrentStep(
  actorUserId: string,
  approvals: ApplicationApprovalRow[],
  currentRow: ApplicationApprovalRow
): Promise<void> {
  const stepCount = approvals.length;

  if (await canActorDecideApprovalStep(actorUserId, currentRow.approverRole, stepCount)) {
    return;
  }

  const sorted = [...approvals].sort((a, b) => a.step - b.step);
  for (const row of sorted) {
    if (row.step <= currentRow.step || row.status !== "pending") continue;
    if (await canActorDecideApprovalStep(actorUserId, row.approverRole, stepCount)) {
      throw badRequest("admin.approvalStepNotReady");
    }
  }

  throw forbidden("admin.approvalStepForbidden");
}
