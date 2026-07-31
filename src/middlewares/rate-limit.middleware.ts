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

/**
 * İstemci IP'si; çözülemezse `null`. Ters proxy arkasındaysak gerçek istemci
 * X-Forwarded-For'un ilk girdisidir.
 *
 * ASLA FIRLATMAZ. `getConnInfo` (hono/bun) soket bilgisini `c.env.server`
 * üzerinden arar; bu yalnızca `Bun.serve` ile gelen isteklerde vardır. Hono'nun
 * `app.request()` arayüzünde (testler, iç çağrılar) `c.env` yoktur ve fonksiyon
 * TypeError atar. Bu, denetim sink'ini her mutasyonda düşürüyordu.
 *
 * Neden "unknown" gibi bir yer tutucu DEĞİL de `null`: bu değer hız sınırı
 * ANAHTARI olarak kullanılıyor (aşağıda). Sabit bir yer tutucu dönmek, IP'si
 * çözülemeyen HERKESİ tek bir sayaç kovasına toplar — yani tek bir kullanıcı
 * tüm platformun kayıt kotasını yiyebilir. `null` ise createRateLimiter'ın
 * "kimlik yok → sınırlama yok" yoluna girer (modülün fail-open ilkesiyle
 * tutarlı: sınır bir korumadır, doğruluk kaynağı değil). Denetim kaydında da
 * null, "bilinmiyor"un dürüst karşılığıdır (kolon nullable).
 */
export function clientIp(c: Context): string | null {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
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

/**
 * Aynı endpoint için kaba bir SEL koruması (asıl koruma yukarıdaki e-posta
 * limitidir). KISA pencere — gerekçe için `registerLimit`'e bakınız.
 */
export const resendVerificationIpLimit = limiter({
  keyPrefix: "resend:ip",
  limit: 20,
  windowSeconds: 60,
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
 * Kayıt — IP başına (henüz bir kimlik yok, başka anahtar yok).
 *
 * ════════════════════════════════════════════════════════════════════════
 * Neden UZUN pencere + küçük limit DEĞİL, KISA pencere?
 * ════════════════════════════════════════════════════════════════════════
 * Kampüs NAT'ı arkasındaki yüzlerce öğrenci tek bir public IP'den çıkar, yani
 * bu sayaç bir kişiyi değil TÜM KAMPÜSÜ ölçer. Burası çok kiracılı (SaaS) bir
 * ürün: üniversitelerin öğrenci sayıları 500 ile 50.000 arasında değişir, o
 * yüzden "kampüse yetecek" tek bir rakam YOKTUR — her seçim bir okul için fazla,
 * başkası için az olur.
 *
 * Asıl zarar limite takılmak değil, KİLİTLİ KALMA SÜRESİDİR. Sabit pencerede
 * tavana vuran, pencere kapanana kadar bekler: 1 saatlik pencerede oryantasyon
 * günü bir kampüs bir SAAT boyunca kaydolamaz. Bu yüzden pencere 1 DAKİKAYA
 * indirildi — en kötü durumda kullanıcı ~60 sn sonra tekrar dener (cevaptaki
 * `Retry-After` bunu söyler) ve akış kendini toparlar.
 *
 * Böylece sınır KAMPÜS BÜYÜKLÜĞÜNDEN BAĞIMSIZ hale gelir: ayırt edici özellik
 * toplam hacim değil, İNSAN hızı ile MAKİNE hızı arasındaki farktır. 60 saniyede
 * aynı NAT'tan 30 kayıt formu gönderen bir insan kalabalığı zaten olağandışıdır
 * ve takılsa bile saniyeler içinde devam eder; bir script ise saniyede yüzlerce
 * dener ve burada durur.
 *
 * Kalan savunma katmanları (bu limit tek başına değil):
 *   - kayıt TANINAN bir okul domaini ister (auth.service register)
 *   - var olan e-posta 400 döner ve MAİL GÖNDERMEZ → bir adresi döngüye alıp
 *     mail seli yapılamaz; saldırganın her seferinde yeni bir adres uydurması gerekir
 *   - hesap doğrulanana kadar `pending` — kullanılamaz
 */
export const registerLimit = limiter({
  keyPrefix: "register:ip",
  limit: 30,
  windowSeconds: 60,
  keyFn: (c) => clientIp(c),
});

/**
 * Tenant yönetici davet kabulü — IP başına (public uç, kimlik yok).
 * Token yüksek entropili ve hash'li; asıl koruma budur. IP limiti kaba kuvvet
 * denemelerini yavaşlatır; enumeration için tüm hata durumları aynı mesajı döner.
 */
export const acceptTenantAdminInvitationIpLimit = limiter({
  keyPrefix: "invite-accept:ip",
  limit: 30,
  windowSeconds: 60,
  keyFn: (c) => clientIp(c),
});

export const forgotPasswordEmailLimit = limiter({
  keyPrefix: "forgot-password:email",
  limit: 3,
  windowSeconds: 60 * 60,
  keyFn: (c) => bodyField(c, "email"),
});

export const forgotPasswordIpLimit = limiter({
  keyPrefix: "forgot-password:ip",
  limit: 20,
  windowSeconds: 60,
  keyFn: (c) => clientIp(c),
});

export const resetPasswordIpLimit = limiter({
  keyPrefix: "reset-password:ip",
  limit: 30,
  windowSeconds: 60,
  keyFn: (c) => clientIp(c),
});
