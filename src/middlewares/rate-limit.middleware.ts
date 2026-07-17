import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { createRateLimiter, RedisRateLimitStore, type RateLimitStore } from "../core/ratelimit";
import { env } from "../config/env";
import { redis } from "../shared/redis/redis.client";
import { logger } from "../shared/logger/logger";

/**
 * Bu projenin hız sınırı KURULUMU — taşınabilir `core/ratelimit` fabrikasının
 * projeye özel bağlanması (depolama mevcut Redis'ten, kapatma anahtarı env'den,
 * hata bu projenin logger'ına). Aynı desen: shared/cache/cache.client.ts.
 *
 * Mekanizma (pencere/sayaç/başlık/fail-open) core'da; burada yalnızca bu projeye
 * ait KARARLAR var: neye göre anahtarlıyoruz ve limitler ne.
 *
 * ════════════════════════════════════════════════════════════════════════
 * ANAHTARLAMA İLKESİ — neden IP değil?
 * ════════════════════════════════════════════════════════════════════════
 * Öğrenciler kampüs ağından, tek bir public IP'nin (NAT) arkasından çıkar.
 * IP başına limit koymak, bir kişi limiti doldurduğunda TÜM KAMPÜSÜ kilitler.
 * Bu yüzden mümkün olan her yerde *korunan kaynağın kimliğine* (e-posta, userId)
 * göre anahtarlarız; IP yalnızca kimliğin bulunmadığı yerlerde (kayıt) ve cömert
 * bir tavanla kullanılır.
 */

const log = logger.child({ module: "rate-limit" });

/** Tüm limitlerin paylaştığı depolama: mevcut Redis bağlantısı (çok-instance güvenli). */
const store: RateLimitStore = new RedisRateLimitStore(redis);

/**
 * Bu projenin limit fabrikası — ortak kararları (store/logger/env kapatma) tek
 * yerde sabitler, çağrı yerinde yalnızca limit değerleri kalır.
 *
 * `disabled` bir FONKSİYON: env açılışta değil çağrı anında okunur, böylece
 * kapatma anahtarı modül import sırasına bağlı kalmaz.
 */
const limiter = (options: {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
  keyFn: (c: Context) => string | null | Promise<string | null>;
}) =>
  createRateLimiter({
    ...options,
    store,
    logger: log,
    disabled: () => env.RATE_LIMIT_DISABLED,
  });

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

// ════════════════════════════════════════════════════════════════════════
// HAZIR LİMİTLER — değerler tek yerde, endpoint'ler bunları import eder.
// ════════════════════════════════════════════════════════════════════════

/**
 * Doğrulama maili yeniden gönderimi — HEDEF E-POSTA başına.
 * Korunan kaynak, o e-postanın gelen kutusudur; kampüsün ortak IP'siyle ilgisi yok.
 * Not: hesap var olmasa da sayaç artar → endpoint'in "hesap var mı?" sızıntısı
 * (user enumeration) yapmama garantisi korunur.
 */
export const resendVerificationEmailLimit = limiter({
  keyPrefix: "resend:email",
  limit: 3,
  windowSeconds: 60 * 60,
  keyFn: (c) => bodyField(c, "email"),
});

/** Aynı endpoint için kaba bir sel koruması. Kampüs-güvenli olacak kadar cömert. */
export const resendVerificationIpLimit = limiter({
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
export const loginLimit = limiter({
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
export const registerLimit = limiter({
  keyPrefix: "register:ip",
  limit: 60,
  windowSeconds: 60 * 60,
  keyFn: (c) => clientIp(c),
});
