import { ForbiddenError, UnauthorizedError } from "../../core/http/errors";
import type { AuthzContext } from "../../core/rbac/rbac.types";
import type { AuthClaims } from "../../core/auth/auth.middleware";
import "./authz"; // AuthzContext'e status alanını ekleyen declaration merging
import { resolveTenantStatus, tenantBlocksAccess } from "./tenant-status.cache";

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
 * JWT'deki session epoch ile authz snapshot'taki sürümü karşılaştırır.
 * Eksik claim → 0 (deploy sonrası kitlesel çıkış yok).
 */
export const enforceTokenVersion = (authz: AuthzContext, subject: AuthClaims): void => {
  const claimVersion = subject.tokenVersion ?? 0;
  const currentVersion = authz.tokenVersion ?? 0;
  if (claimVersion !== currentVersion) {
    throw new UnauthorizedError("auth.sessionRevoked");
  }
};

/**
 * Tenant askıya alındığında o üniversitenin kullanıcılarının erişimini keser.
 * Platform hesapları (`universityId` yok) tenant-status okumasından muaf.
 * Tenant durumu `rbac:tenant-status:<universityId>` anahtarından okunur (bkz. ADR 0009 rev.).
 */
export const enforceTenantStatus = async (authz: AuthzContext): Promise<void> => {
  if (!authz.universityId) return;
  const snapshot = await resolveTenantStatus(authz.universityId);
  if (tenantBlocksAccess(snapshot)) {
    throw new ForbiddenError("rbac.tenantSuspended");
  }
};

/**
 * Resolve sonrası tüm proje authz politikaları — `configureRbac.enforce` ve
 * `requireActiveUser` bu fonksiyonu paylaşır; tenant askısı / hesap durumu tek
 * noktadan zorlanır.
 */
export const enforceAuthzPolicy = async (authz: AuthzContext, subject: AuthClaims): Promise<void> => {
  enforceAccountStatus(authz);
  await enforceTenantStatus(authz);
  enforceTokenVersion(authz, subject);
};
