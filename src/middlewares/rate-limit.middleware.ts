import { Context, Next, MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";
import { env } from "../config/env";
import { redis } from "../shared/redis/redis.client";
import { logger } from "../shared/logger/logger";

const log = logger.child({ module: "rate-limit" });

/**
 * Redis tabanlı sabit pencere (fixed-window) hız sınırlayıcı. Çok-instance
 * güvenlidir: sayaç Redis'te tutulur, `INCR` atomiktir.
 *
 * ════════════════════════════════════════════════════════════════════════
 * ANAHTARLAMA İLKESİ — neden IP değil?
 * ════════════════════════════════════════════════════════════════════════
 * Öğrenciler kampüs ağından, tek bir public IP'nin (NAT) arkasından çıkar.
 * IP başına limit koymak, bir kişinin limiti doldurduğunda TÜM KAMPÜSÜ
 * kilitler. Bu yüzden mümkün olan her yerde *korunan kaynağın kimliğine*
 * (e-posta, userId) göre anahtarlarız; IP yalnızca kimliğin bulunmadığı
 * yerlerde (kayıt) ve cömert bir tavanla kullanılır.
 */

export interface RateLimitOptions {
  /** Redis anahtar öneki — endpoint'ler birbirinin sayacını yemesin. */
  keyPrefix: string;
  /** Pencere başına izin verilen istek sayısı. */
  limit: number;
  /** Pencere uzunluğu (saniye). */
  windowSeconds: number;
  /**
   * İsteği kime sayacağımızı belirler. `null` dönerse limit UYGULANMAZ
   * (örn. body'de e-posta yoksa — zaten validasyon reddedecektir).
   */
  keyFn: (c: Context) => string | null | Promise<string | null>;
}

/** Ters proxy arkasındaysak gerçek istemci IP'si X-Forwarded-For'un ilk girdisidir. */
export function clientIp(c: Context): string {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
  }
  return getConnInfo(c).remote.address ?? "unknown";
}

/**
 * Sayacı artırır ve pencerenin bitişine kalan süreyi döner.
 * `INCR` + (ilk yazımda) `EXPIRE` tek pipeline'da gider.
 */
async function hit(key: string, windowSeconds: number) {
  const [incrResult, ttlResult] = await redis
    .pipeline()
    .incr(key)
    .ttl(key)
    .exec() as [[Error | null, number], [Error | null, number]];

  const count = incrResult[1];
  let ttl = ttlResult[1];

  // İlk istek (ya da TTL bir şekilde kaybolmuş): pencereyi başlat.
  if (ttl < 0) {
    await redis.expire(key, windowSeconds);
    ttl = windowSeconds;
  }

  return { count, ttl };
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { keyPrefix, limit, windowSeconds, keyFn } = options;

  return async (c: Context, next: Next) => {
    if (env.RATE_LIMIT_DISABLED) {
      return next();
    }

    const identity = await keyFn(c);
    if (identity === null) {
      return next(); // kimlik çıkarılamadı → sınırlama yok
    }

    const key = `ratelimit:${keyPrefix}:${identity}`;

    let count: number;
    let ttl: number;
    try {
      ({ count, ttl } = await hit(key, windowSeconds));
    } catch (error) {
      // FAIL-OPEN: Redis düştüyse tüm API'yi kilitlemek, hız sınırını
      // aşılmasına izin vermekten çok daha kötüdür.
      log.error({ err: error, keyPrefix }, "redis hatası, istek geçiriliyor (fail-open)");
      return next();
    }

    const remaining = Math.max(0, limit - count);
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(remaining));
    c.header("RateLimit-Reset", String(ttl));

    if (count > limit) {
      c.header("Retry-After", String(ttl));
      const minutes = Math.max(1, Math.ceil(ttl / 60));
      return c.json(
        {
          success: false,
          // Frontend metne string-match etmesin diye makine-okur kod.
          code: "RATE_LIMITED",
          message: `Çok fazla deneme yaptınız. Lütfen ${minutes} dakika sonra tekrar deneyin.`,
        },
        429
      );
    }

    await next();
  };
}

// ════════════════════════════════════════════════════════════════════════
// HAZIR LİMİTLER — değerler tek yerde, endpoint'ler bunları import eder.
// ════════════════════════════════════════════════════════════════════════

/** JSON body'den bir alanı, akışı bozmadan okur (Hono body'yi cache'ler). */
async function bodyField(c: Context, field: string): Promise<string | null> {
  try {
    const body = await c.req.raw.clone().json();
    const value = body?.[field];
    return typeof value === "string" && value.length > 0 ? value.toLowerCase() : null;
  } catch {
    return null; // gövde JSON değil → zValidator zaten reddedecek
  }
}

/**
 * Doğrulama maili yeniden gönderimi — HEDEF E-POSTA başına.
 * Korunan kaynak, o e-postanın gelen kutusudur; kampüsün ortak IP'siyle ilgisi yok.
 * Not: hesap var olmasa da sayaç artar → endpoint'in "hesap var mı?" sızıntısı
 * (user enumeration) yapmama garantisi korunur.
 */
export const resendVerificationEmailLimit = rateLimit({
  keyPrefix: "resend:email",
  limit: 3,
  windowSeconds: 60 * 60,
  keyFn: (c) => bodyField(c, "email"),
});

/** Aynı endpoint için kaba bir sel koruması. Kampüs-güvenli olacak kadar cömert. */
export const resendVerificationIpLimit = rateLimit({
  keyPrefix: "resend:ip",
  limit: 30,
  windowSeconds: 60 * 60,
  keyFn: (c) => clientIp(c),
});

/**
 * Giriş — HESAP (e-posta) başına. Brute-force / credential stuffing'i durdurur.
 * IP başına limit BİLİNÇLİ OLARAK YOK: kampüs NAT'ı arkasındaki yüzlerce öğrenci
 * aynı IP'yi paylaşır, tek bir yanlış şifre denemesi seli hepsini kilitlerdi.
 */
export const loginLimit = rateLimit({
  keyPrefix: "login:email",
  limit: 10,
  windowSeconds: 15 * 60,
  keyFn: (c) => bodyField(c, "email"),
});

/**
 * Kayıt — IP başına (henüz bir kimlik yok). Cömert bir tavan: kayıt zaten
 * (a) tanınan bir okul domaini ve (b) benzersiz e-posta gerektiriyor, dolayısıyla
 * istismar payı dar. Oryantasyon günü tüm kampüsün kaydolabilmesi gerekir.
 */
export const registerLimit = rateLimit({
  keyPrefix: "register:ip",
  limit: 60,
  windowSeconds: 60 * 60,
  keyFn: (c) => clientIp(c),
});
