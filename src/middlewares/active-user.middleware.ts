import { Context, Next } from "hono";
import { Variables } from "../core/auth/auth.middleware";
import { resolveAuthz } from "../shared/rbac/rbac.cache";
import { enforceAuthzPolicy } from "../shared/rbac/authz-policy";

/**
 * authMiddleware'den SONRA çalışır. Askıya alınan hesap ve askıya alınan tenant
 * erişimini ANINDA keser (bkz. docs/design/05 #7). guard() zinciri olmayan
 * self-service / kulüp rotalarında kullanılır — `enforceAuthzPolicy` attachAuthz ile
 * paylaşılır; tenant askısı burada da geçerli olur.
 *
 * Durum, RBAC cache'inden (resolveAuthz) okunur; hesap/tenant durumu değiştiğinde
 * ilgili servis cache'i invalidate ettiği için ekstra DB sorgusu çoğu istekte yapılmaz.
 */
export const requireActiveUser = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const user = c.get("user");
  const authz = await resolveAuthz(user.userId);
  enforceAuthzPolicy(authz);
  await next();
};
