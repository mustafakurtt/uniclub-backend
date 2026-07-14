import { ForbiddenError } from "../../core/http/errors";
import type { AuthzContext } from "../../core/rbac/rbac.types";
import "./authz"; // AuthzContext'e status alanını ekleyen declaration merging

/**
 * Bu projenin resolve-sonrası authz politikası. core/rbac'a `configureRbac.enforce`
 * ile enjekte edilir (bkz. index.ts); `attachAuthz` her istekte çağırır. Böylece
 * "suspended" gibi hesap-durumu kavramı çekirdek RBAC'ta DEĞİL, projede yaşar.
 *
 * Askıya alma bir sonraki istekte anında etkilidir çünkü authz cache'e `status`
 * gömülüdür ve durum değişiminde cache invalidate edilir (bkz. rbac.cache +
 * authService.verifyEmail / moderationService).
 */
export const enforceAccountStatus = (authz: AuthzContext): void => {
  if (authz.status === "suspended") {
    throw new ForbiddenError("rbac.accountSuspended");
  }
};
