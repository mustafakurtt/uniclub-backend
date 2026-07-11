import { Context, Next } from "hono";
import { Variables, AuthClaims } from "../auth/auth.middleware";
import { ForbiddenError } from "../http/errors";
import { EffectivePermissions } from "./rbac.types";

export type RbacVariables = Variables & {
  authz: EffectivePermissions;
  scopeTenantId?: string;
};

/**
 * DİKİŞ: RBAC motoru proje-bağımsız kalsın diye, projeye özgü olan HER ŞEY enjekte
 * edilir (setGuardAuditSink deseni). Böylece core kaynağı ne alan adı (userId,
 * universityId) ne de rol adı (super_admin) İSMEN bilir; ayrıca izin kaynağını
 * (getEffectivePermissions) da enjekte ettiğimiz için core/rbac artık shared'a
 * HİÇ bağlı değildir.
 */
export interface RbacConfig {
  /** Kullanıcı payload'ından izin araması için özne kimliğini çıkarır. */
  getSubjectId: (user: AuthClaims) => string;
  /** Kullanıcı payload'ından tenant kimliğini çıkarır (yoksa null). */
  getTenantId: (user: AuthClaims) => string | null;
  /** Tenant sınırını aşabilen (çapraz-tenant) platform seviyesi rol adları. */
  tenantScopeBypassRoles: string[];
  /** tenantScoped rotalarda kıyaslanacak varsayılan path parametresinin adı. */
  tenantParamName: string;
  /** Bir öznenin etkin rol/izinlerini çözer (proje: Redis cache'li repo). */
  getEffectivePermissions: (subjectId: string) => Promise<EffectivePermissions>;
}

let config: RbacConfig | null = null;

export function configureRbac(next: RbacConfig) {
  config = next;
}

function cfg(): RbacConfig {
  if (!config) throw new Error("RBAC yapılandırılmadı: configureRbac çağrılmalı.");
  return config;
}

/**
 * authMiddleware'den SONRA çalışmalıdır. Kullanıcının etkin rol/izinlerini çözüp
 * context'e ekler. Askıya alınan kullanıcının erişimi ANINDA kesilir.
 */
export const attachAuthz = async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
  const authz = await cfg().getEffectivePermissions(cfg().getSubjectId(c.get("user")));

  if (authz.status === "suspended") {
    throw new ForbiddenError("rbac.accountSuspended");
  }

  c.set("authz", authz);
  await next();
};

export const requirePermission = (key: string) => {
  return async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
    if (!c.get("authz").permissions.includes(key)) {
      throw new ForbiddenError("rbac.forbidden");
    }
    await next();
  };
};

export const requireRole = (roleName: string) => {
  return async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
    if (!c.get("authz").roles.includes(roleName)) {
      throw new ForbiddenError("rbac.forbidden");
    }
    await next();
  };
};

/**
 * Bir öznenin tenant sınırlarını aşabildiği (platform seviyesi rolü olduğu) mı?
 * Bypass rol adları enjekte edilir (proje verisi). admin.service ile aynı tanımı
 * paylaşsın diye tek noktadan verilir.
 */
export const hasTenantScopeBypass = (authz: EffectivePermissions): boolean =>
  authz.roles.some((role) => cfg().tenantScopeBypassRoles.includes(role));

/**
 * Path'teki tenant parametresini, kullanıcının kendi tenant'ıyla kıyaslar. Bypass
 * rolü taşıyanlar herhangi bir tenant'ı hedefleyebilir. Param adı verilmezse
 * `config.tenantParamName`'e düşer; tenant kimliği enjekte edilen `getTenantId`
 * ile alınır — core ne param adını ne alan adını İSMEN bilir.
 */
export const enforceTenantScope = (paramName?: string) => {
  return async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
    const targetTenantId = c.req.param(paramName ?? cfg().tenantParamName);
    const authz = c.get("authz");

    if (hasTenantScopeBypass(authz)) {
      c.set("scopeTenantId", targetTenantId);
      return next();
    }

    // Tenant kimliği null ise (bypass'sız platform hesabı) karşılaştırma asla
    // tutmaz — tenant kaynaklarına erişim doğru şekilde reddedilir.
    const tenantId = cfg().getTenantId(c.get("user"));
    if (!tenantId || targetTenantId !== tenantId) {
      throw new ForbiddenError("rbac.tenantForbidden");
    }

    c.set("scopeTenantId", tenantId);
    await next();
  };
};
