import { logger } from "../shared/logger/logger";
import { createRequestLogger } from "../core/http/request-logger";
import { LogLevel } from "../core/logger/logger";
import type { AuthClaims } from "../core/auth/auth.middleware";

/**
 * `hono/logger()`'ın (renkli metin) yerini alır: her istek için tek satır
 * yapılandırılmış JSON. `requestId` ile birlikte loglanır ki istemciye dönen
 * requestId ile bu satır eşleştirilebilsin (bkz. error.middleware.ts).
 *
 * Taşınabilir `createRequestLogger` fabrikasının bu projeye özel kurulumu:
 * kök logger'ın child'ı + Türkçe mesajlar enjekte edilir. Seviye eşlemesi
 * (5xx→error, 4xx→warn) fabrikanın varsayılanıdır. Bkz. `core/http/request-logger.ts`.
 */
const log = logger.child({ module: "http" });

/** Seviyeye göre Türkçe mesajlar (core'un nötr İngilizce varsayılanını override eder). */
const MESSAGES: Partial<Record<LogLevel, string>> = {
  [LogLevel.Error]: "istek hata ile tamamlandı",
  [LogLevel.Warn]: "istek başarısız",
  [LogLevel.Info]: "istek tamamlandı",
};

export const requestLogger = createRequestLogger({
  logger: log,
  getMessage: (level) => MESSAGES[level] ?? MESSAGES[LogLevel.Info]!,
  /**
   * Kimlik/tenant zenginleştirmesi — proje-özel alan, bu yüzden core'da değil
   * burada. `getExtraFields` `await next()` SONRASI çalışır; o noktada auth
   * middleware `user`'ı kurmuş olur (kimliksiz/public isteklerde yok → boş).
   * Multi-tenant'ta "bu 500'ü hangi kullanıcı/üniversite aldı" sorusuna log
   * satırından anında cevap verir. universityId null = platform hesabı.
   */
  getExtraFields: (c) => {
    const user = c.get("user") as AuthClaims | undefined;
    if (!user) return {};
    return { userId: user.userId, universityId: user.universityId };
  },
  /**
   * Sık pollanan altyapı uçlarını loglama — gürültü. Prometheus `/metrics`'i her
   * 15sn scrape eder, load-balancer `/health`'i sürekli yoklar; ikisi de logu
   * doldurur ama sinyal taşımaz. (requestId yine üretilir; sadece log satırı atlanır.)
   */
  skip: (c) => c.req.path === "/metrics" || c.req.path === "/health",
});
