import { Context, Next } from "hono";
import { Variables } from "../core/auth/auth.middleware";
import { resolveAuthz } from "../shared/rbac/rbac.cache";

/**
 * authMiddleware'den SONRA çalışır. E-postasını henüz doğrulamamış (`pending`)
 * kullanıcının YAZMA işlemlerini engeller.
 *
 * Bilinçli tasarım: pending kullanıcı sisteme GİRİŞ YAPABİLİR ve okuma yapabilir
 * (kulüpleri gezebilir) — böylece arayüzdeki "e-postanı doğrula" uyarısı ve
 * "maili yeniden gönder" akışı çalışır. Yalnızca kalıcı etki yaratan işlemler
 * (kulübe katılma, başvuru, duyuru/içerik oluşturma) kilitlidir.
 *
 * `requireActiveUser` (suspended kontrolü) ile birlikte kullanılır; ikisi de
 * durumu RBAC cache'inden okur, ekstra DB sorgusu yapmaz. Doğrulama anında
 * `authService.verifyEmail` cache'i invalidate ettiği için kısıt ANINDA kalkar.
 */
export const requireVerifiedUser = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const user = c.get("user");
  const authz = await resolveAuthz(user.userId);

  if (authz.status === "pending") {
    return c.json(
      {
        success: false,
        // Makine-okur kod: frontend bunu genel bir 403'ten ayırıp kullanıcıyı
        // doğrulama maili akışına yönlendirir (mesaj metnine string-match etmez).
        code: "EMAIL_NOT_VERIFIED",
        message: "Bu işlem için e-posta adresinizi doğrulamanız gerekiyor.",
      },
      403
    );
  }

  await next();
};

/** Yan etkisi olmayan (okuma) metodlar — doğrulanmamış kullanıcıya da açıktır. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * `requireVerifiedUser`'ın metod-farkında hâli: okuma serbest, YAZMA kilitli.
 *
 * Rota rota dağıtmak yerine router kökünde tek noktada uygulanır — böylece
 * feature'a yeni bir POST/PATCH/DELETE eklendiğinde koruma kendiliğinden geçerli
 * olur (yeni rotayı korumayı unutma riski ortadan kalkar).
 */
export const requireVerifiedUserForWrites = async (
  c: Context<{ Variables: Variables }>,
  next: Next
) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }
  return requireVerifiedUser(c, next);
};
