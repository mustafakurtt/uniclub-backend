import { Context, Next } from "hono";
import { Variables } from "../auth/auth.middleware";
import { getEffectivePermissions } from "../../shared/rbac/rbac.cache";
import { EffectivePermissions } from "./rbac.types";

export type RbacVariables = Variables & {
  authz: EffectivePermissions;
  scopeUniversityId?: string;
};

/**
 * authMiddleware'den SONRA çalışmalıdır. Kullanıcının etkin rol/izinlerini
 * (Redis cache üzerinden) çözüp context'e ekler.
 */
export const attachAuthz = async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
  const user = c.get("user");
  const authz = await getEffectivePermissions(user.userId);

  // Askıya alınan kullanıcının erişimi ANINDA kesilir (guard'lı tüm rotalar).
  // Not: durum değiştiren servis (admin.updateUserStatus) bu kullanıcının
  // cache'ini invalidate ettiği için askı bir sonraki istekte etkilidir.
  if (authz.status === "suspended") {
    return c.json({
      success: false,
      message: "Hesabınız askıya alınmıştır. Lütfen SKS birimiyle iletişime geçin.",
    }, 403);
  }

  c.set("authz", authz);
  await next();
};

export const requirePermission = (key: string) => {
  return async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
    const authz = c.get("authz");
    if (!authz.permissions.includes(key)) {
      return c.json({
        success: false,
        message: "Bu işlem için yetkiniz bulunmamaktadır.",
      }, 403);
    }
    await next();
  };
};

export const requireRole = (roleName: string) => {
  return async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
    const authz = c.get("authz");
    if (!authz.roles.includes(roleName)) {
      return c.json({
        success: false,
        message: "Bu işlem için yetkiniz bulunmamaktadır.",
      }, 403);
    }
    await next();
  };
};

/**
 * Path'teki :universityId parametresini, kullanıcının kendi üniversitesiyle kıyaslar.
 * super_admin rolü bu kontrolü bypass eder (herhangi bir üniversiteyi hedefleyebilir).
 *
 * Platform hesapları (user.universityId === null) hiçbir tenant'a ait değildir:
 * bypass rolü taşıyorlarsa her tenant'ı hedefleyebilir, taşımıyorlarsa hiçbir
 * tenant kaynağına erişemezler (null, hiçbir :universityId ile eşleşmez).
 *
 * Taşınabilirlik notu: "super_admin"/"platform_support" rol adları ve
 * "universityId" (user.universityId) bu projenin tenant modeline özgüdür. Bu
 * core/ klasörünü başka bir projeye kopyalarken tenant kimliği/bypass rolleri
 * farklıysa bu fonksiyon parametrik hale getirilmelidir.
 */
// Tenant scope'u bypass eden platform seviyesi roller (çapraz-tenant erişim).
// super_admin tam yetkili; platform_support salt-okunur (yalnızca *.view taşır).
const TENANT_SCOPE_BYPASS_ROLES = ["super_admin", "platform_support"];

/**
 * Aktör tenant sınırlarını aşabiliyor mu (platform seviyesi bir rolü var mı)?
 * enforceTenantScope ile "erişilebilir üniversiteler" hesabı (admin.service)
 * aynı tanımı paylaşsın diye tek noktadan verilir.
 */
export const hasTenantScopeBypass = (authz: EffectivePermissions): boolean =>
  authz.roles.some((role) => TENANT_SCOPE_BYPASS_ROLES.includes(role));

export const enforceTenantScope = (paramName: string = "universityId") => {
  return async (c: Context<{ Variables: RbacVariables }>, next: Next) => {
    const targetUniversityId = c.req.param(paramName);
    const user = c.get("user");
    const authz = c.get("authz");

    if (hasTenantScopeBypass(authz)) {
      c.set("scopeUniversityId", targetUniversityId);
      return next();
    }

    // user.universityId null ise (bypass'sız platform hesabı) bu karşılaştırma
    // asla tutmaz — tenant kaynaklarına erişim doğru şekilde reddedilir.
    if (!user.universityId || targetUniversityId !== user.universityId) {
      return c.json({
        success: false,
        message: "Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır.",
      }, 403);
    }

    c.set("scopeUniversityId", user.universityId);
    await next();
  };
};
