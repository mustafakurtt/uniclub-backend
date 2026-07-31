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

/**
 * Tenant askıya alındığında o üniversitenin kullanıcılarının erişimini keser.
 * Platform hesapları (`universityId` yok) ve bypass rolleri etkilenmez — tenant
 * durumu authz cache'e gömülür (bkz. rbac.repository).
 */
export const enforceTenantStatus = (authz: AuthzContext): void => {
  if (authz.universityId && authz.tenantStatus === "suspended") {
    throw new ForbiddenError("rbac.tenantSuspended");
  }
};

/**
 * Resolve sonrası tüm proje authz politikaları — `configureRbac.enforce` ve
 * `requireActiveUser` bu fonksiyonu paylaşır; tenant askısı / hesap durumu tek
 * noktadan zorlanır.
 */
export const enforceAuthzPolicy = (authz: AuthzContext): void => {
  enforceAccountStatus(authz);
  enforceTenantStatus(authz);
};
