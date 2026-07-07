import { Context, Next } from "hono";
import { Variables } from "../core/auth/auth.middleware";
import { getEffectivePermissions } from "../shared/rbac/rbac.cache";

/**
 * authMiddleware'den SONRA çalışır. Askıya alınan (suspended) kullanıcının
 * erişimini ANINDA keser (bkz. docs/yonetim/05 #7). guard() zinciri olmayan
 * self-service / kulüp rotalarında kullanılır — guard'lı rotalar aynı kontrolü
 * attachAuthz içinde yapar.
 *
 * Durum, RBAC cache'inden (getEffectivePermissions) okunur; hesap durumu
 * değiştiğinde ilgili servis cache'i invalidate ettiği için ekstra DB sorgusu
 * çoğu istekte yapılmaz.
 */
export const requireActiveUser = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const user = c.get("user");
  const authz = await getEffectivePermissions(user.userId);

  if (authz.status === "suspended") {
    return c.json({
      success: false,
      message: "Hesabınız askıya alınmıştır. Lütfen SKS birimiyle iletişime geçin.",
    }, 403);
  }

  await next();
};
