import { Context, Next } from "hono";
import { UnauthorizedError } from "../http/errors";

/**
 * JWT claim'lerinin (doğrulanmış) şekli. `userId` + tenant (`universityId`) bu
 * projenin auth sözleşmesidir; başka bir projeye taşırken burası özelleştirilir.
 * (core/auth'un tek proje-flavour'lı yeri; RUNTIME bağımlılığı yok — bkz. dikiş.)
 */
export interface JwtPayload {
  userId: string;
  /** NULL = platform hesabı (hiçbir üniversiteye bağlı değil). Bkz. schema.users. */
  universityId: string | null;
  exp: number;
}

export type Variables = {
  user: JwtPayload;
};

type TokenVerifier = (token: string) => Promise<JwtPayload | null>;

/**
 * DİKİŞ: token doğrulama SECRET'e (env) ihtiyaç duyar, o yüzden core burada
 * import ETMEZ — doğrulayıcı uygulama açılışında `setTokenVerifier` ile enjekte
 * edilir (aynı `setGuardAuditSink` deseni). Böylece core/auth env/shared'a
 * bağlanmaz, taşınabilir kalır.
 */
let verifier: TokenVerifier | null = null;

export function setTokenVerifier(fn: TokenVerifier) {
  verifier = fn;
}

/**
 * `Authorization: Bearer <token>` okur, doğrular ve `user` context değişkenini
 * kurar. Başarısızlıkta Türkçe/zarf gömmek yerine `UnauthorizedError` (mesaj
 * ANAHTARI) FIRLATIR → app.onError tek noktadan 401 + i18n zarfına çevirir.
 */
export const authMiddleware = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("auth.tokenMissing");
  }

  if (!verifier) {
    // Yapılandırma hatası (açılışta setTokenVerifier çağrılmadı) → jenerik 500.
    throw new Error("Token doğrulayıcı ayarlanmadı: setTokenVerifier çağrılmalı.");
  }

  const payload = await verifier(authHeader.split(" ")[1]);
  if (!payload) {
    throw new UnauthorizedError("auth.tokenInvalid");
  }

  c.set("user", payload);
  await next();
};
