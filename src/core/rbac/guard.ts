import type { MiddlewareHandler } from "hono";
import { authMiddleware } from "../auth/auth.middleware";
import { attachAuthz, requirePermission, enforceTenantScope, RbacVariables } from "./rbac.middleware";
import { auditTrail } from "./audit-hook";

export type GuardOptions = {
  /** true ise zincire enforceTenantScope() eklenir. */
  tenantScoped?: boolean;
  /** tenantScoped: true iken path parametresinin adını özelleştirmek için (verilmezse config.tenantParamName). */
  tenantParam?: string;
};

type BaseGuardChain = readonly [
  typeof authMiddleware,
  typeof attachAuthz,
  MiddlewareHandler<{ Variables: RbacVariables }>,
  MiddlewareHandler<{ Variables: RbacVariables }>
];

type TenantScopedGuardChain = readonly [
  typeof authMiddleware,
  typeof attachAuthz,
  MiddlewareHandler<{ Variables: RbacVariables }>,
  MiddlewareHandler<{ Variables: RbacVariables }>,
  MiddlewareHandler<{ Variables: RbacVariables }>
];

/**
 * Her feature'ın ayrı ayrı kopyaladığı
 *   [authMiddleware, attachAuthz, auditTrail(key), requirePermission(key), enforceTenantScope()?]
 * zincirini tek noktadan üretir. auditTrail, requirePermission'dan ÖNCE durur ki
 * reddedilen (403) yetkili-işlem denemeleri de denetim izine düşsün
 * (bkz. core/rbac/audit-hook.ts).
 *
 *   import { guard } from "../../core/rbac/guard";
 *   ...guard(UniversityPermission.MANAGE)
 *
 * Not: Dönüş tipi bilinçli olarak sabit uzunlukta bir tuple (array değil) —
 * Hono'nun route metodları (...guard(key), zValidator(...), handler) rest
 * parametrelerini doğru overload'a eşleyebilmek için argüman sayısını
 * derleme zamanında bilmek zorunda. Dönüş tipi "MiddlewareHandler[]" gibi
 * genel bir array olsaydı bu eşleme bozulur, path param tipleri (`c.req.param()`)
 * ve `zValidator` sonrası `c.req.valid(...)` çağrıları `{}`'e düşerdi.
 */
export function guard(permissionKey: string): BaseGuardChain;
export function guard(permissionKey: string, options: GuardOptions & { tenantScoped: true }): TenantScopedGuardChain;
export function guard(permissionKey: string, options?: GuardOptions): BaseGuardChain | TenantScopedGuardChain {
  const chain = [authMiddleware, attachAuthz, auditTrail(permissionKey), requirePermission(permissionKey)] as const;

  if (!options?.tenantScoped) {
    return chain;
  }

  return [...chain, enforceTenantScope(options.tenantParam)] as const;
}
