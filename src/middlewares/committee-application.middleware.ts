import type { Context, MiddlewareHandler, Next } from "hono";
import { authMiddleware } from "../core/auth/auth.middleware";
import { auditTrail } from "../core/rbac/audit-hook";
import { attachAuthz, RbacVariables } from "../core/rbac/rbac.middleware";
import { enforceTenantScope } from "../core/rbac/tenant-scope";
import { committeeApplicationAccessRepository } from "../features/approval-committees/committee-application-access.repository";
import { ClubPermission } from "../features/clubs/clubs.permissions";
import { forbidden } from "../shared/utils/errors";

export type CommitteeApplicationAccess =
  | { via: "permission" }
  | { via: "committee_member"; committeeId: string; approvalStep: number };

export type CommitteeApplicationVariables = RbacVariables & {
  committeeApplicationAccess?: CommitteeApplicationAccess;
};

/**
 * Kulüp başvurusu okuma/oy: global `application.view` VEYA mevcut kademedeki
 * onay kurulu üyeliği. Kurul üyeliği yalnızca o kurulun aktif kademesindeki
 * başvuruya erişim verir — tüm başvuru listesine değil (bkz. club.middleware deseni).
 */
export const requireApplicationViewOrCommitteeStepAccess: MiddlewareHandler<{
  Variables: CommitteeApplicationVariables;
}> = async (c, next) => {
  const authz = c.get("authz");
  if (authz.permissions.includes(ClubPermission.APPLICATION_VIEW)) {
    c.set("committeeApplicationAccess", { via: "permission" });
    return next();
  }

  const user = c.get("user");
  const universityId = c.req.param("universityId");
  const applicationId = c.req.param("applicationId");
  if (!universityId || !applicationId) {
    throw forbidden("rbac.forbidden");
  }
  const access = await committeeApplicationAccessRepository.resolveStepAccess(
    universityId,
    applicationId,
    user.userId
  );
  if (!access) {
    throw forbidden("rbac.forbidden");
  }

  c.set("committeeApplicationAccess", {
    via: "committee_member",
    committeeId: access.committeeId,
    approvalStep: access.approvalStep,
  });
  return next();
};

/** Tenant sınırı + kimlik; kurul üyeliği veya application.view şart değil. */
export function committeeTenantGuard(auditLabel: string) {
  return [
    authMiddleware,
    attachAuthz,
    auditTrail(auditLabel),
    enforceTenantScope(),
  ] as const;
}

/** Başvuru detayı / kurul oyu — application.view veya ilgili kurul kademesi üyeliği. */
export function committeeApplicationGuard(auditLabel: string) {
  return [
    authMiddleware,
    attachAuthz,
    auditTrail(auditLabel),
    requireApplicationViewOrCommitteeStepAccess,
    enforceTenantScope(),
  ] as const;
}
