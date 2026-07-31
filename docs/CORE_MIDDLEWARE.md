# Core Middleware Kataloğu

Bu dosya `src/core`'un HTTP ara katman (middleware) yüzeyini kayıt altına alır:
**bugün ne var**, **sıra neden önemli**, **ne eksik** ve **bilinçli olarak ne
yapmıyoruz**. Amaç core'u başka Bun/Hono projelerine olduğu gibi taşıyabilmek.

---

## Yapısal karar: `core/middlewares/` klasörü YOK — ve olmayacak

Middleware'leri tek bir `core/middlewares/` klasöründe toplamak cazip görünür ama
kodu **teknik türe** göre gruplamak olur ("bunlar middleware"). Core bugün **alana**
göre gruplu ("bu rate limit işi: portu, adaptörleri, middleware'i, hepsi bir arada").

Türe göre taşırsak:
- `rate-limiter.ts` kendi `RateLimitStore`'undan ve adaptörlerinden ayrılır,
- `locale.ts` kendi `translator`'ından ayrılır,
- `core/ratelimit/` tek başına kopyalanabilen bir modül olmaktan çıkar.

Bu, çatının en güçlü özelliğini (alan alan taşınabilirlik) bozar. Hono'nun kendisi
de `hono/logger`, `hono/cors` diye alan alan dağıtır; `hono/middlewares` diye tek
çuval yapmaz. **Kural: yeni bir middleware, ait olduğu ALANIN klasörüne gider.**

---

## Bugün core'da olanlar (11 middleware, 9 dosya)

| Middleware | Alan | Dikiş (projeden enjekte edilen) |
|---|---|---|
| `authMiddleware` | `core/auth` | `setTokenVerifier` — secret env'de, core bilmez |
| `attachAuthz` | `core/rbac` | `configureRbac({ getSubjectId, resolveAuthz, enforce })` |
| `requirePermission` | `core/rbac` | izin anahtarı (string) |
| `requireRole` | `core/rbac` | rol adı (string) |
| `enforceTenantScope` | `core/rbac/tenant-scope` | `configureTenantScope({ getTenantId, paramName, bypassRoles })` |
| `auditTrail` | `core/rbac/audit-hook` | `setGuardAuditSink` |
| `guard` / `guardRole` | `core/rbac/guard` | yukarıdakileri sabit sırayla besteler |
| `createRateLimiter` | `core/ratelimit` | `store`, `keyFn`, `disabled`, `message` |
| `createLocaleMiddleware` | `core/i18n` | `supported`, `fallback` |
| `createRequestLogger` | `core/http` | status→level, mesaj, ek alan seam'leri |
| `metrics.middleware` | `core/metrics` | `prefix`, `getRoute` (kardinalite kontrolü) |

Proje tarafı (`src/middlewares/`) bunların **kurulumudur**, kopyası değil:
`error.middleware.ts`, `rate-limit.middleware.ts`, `request-logger.middleware.ts`
core fabrikalarını env/logger/i18n ile bağlar. `active-user`, `verified-user`,
`club.middleware` ise bu projeye ait POLİTİKALARDIR — core'a girmezler.

---

## Eksik #1: sıra sözleşmesi (en kritik boşluk)

Middleware sırası **load-bearing** ve bu bilgi bugün yalnızca `index.ts`'teki
yorumlarda yaşıyor. Yanlış sıraya koyan biri sessizce bozar:

- `requestId` **en önde** olmalı — yoksa hata cevabı korelasyon kimliği taşımaz.
- `metrics` **erken** olmalı — yoksa 413/4xx'ler ölçüme girmez.
- `secureHeaders` **erken** olmalı — hata cevaplarına da uygulanmalı.
- `locale`, `errorHandler`'dan **önce** çözülmeli — yoksa mesajlar çevrilemez.
- `attachAuthz`, `authMiddleware`'den **sonra** gelmeli — özneyi o kurar.
- `auditTrail`, `requirePermission`'dan **önce** durmalı — reddedilen (403)
  denemeler de denetim izine düşsün diye.

`guard()` bu sorunu RBAC ekseninde zaten çözüyor (zinciri tek yerden besteliyor,
sırayı sabitliyor). Eksik olan, **global zincir** için aynı şey.

**Yapılacak:** `core/http/pipeline.ts` — sıralı, isimli aşamaları olan bir
kompozisyon yardımcısı (`createPipeline([...])`). Sırayı kodda ve tek yerde
sabitler; `index.ts` 15 satır yorum yerine bir liste okur. Yanına bir birim testi:
"requestId, locale'den önce gelir" gibi sıra invaryantlarını kilitler.

---

## Eksik #2: `bodyLimit` 413'ü zarfın DIŞINDA

`index.ts` bugün `hono/body-limit`'i doğrudan kullanıyor ve 413 cevabını **elle**
kuruyor: Türkçe metin gömülü, `app.onError`'dan geçmiyor, i18n'e tabi değil.
Rate limit'i tam bundan kurtardık (429 artık `TooManyRequestsError` → `onError` →
i18n + requestId); 413 hâlâ eski dünyada.

**Yapılacak:** `core/http/errors.ts`'e `PayloadTooLargeError` (413,
`code: "PAYLOAD_TOO_LARGE"`) + `bodyLimit`'in `onError`'ında elle zarf kurmak
yerine bu hatayı fırlat. Küçük iş, tutarlılık kazancı büyük.

---

## Eksik #3: gerçekten yazmaya değer middleware'ler

Öncelik sırasıyla. Her biri **kendi alan klasörüne** gider.

### 3.1 İstek bağlamı — `core/context/request-context.ts`
AsyncLocalStorage ile `requestId`/`userId`/`locale`'i bağlama koyar; servisler ve
kuyruk worker'ları elle parametre taşımadan okur. Bugün `requestId` sadece
request-logger ve error-handler'ın elinde — bir servis log yazınca korelasyon
düşüyor ve zincir takip edilemiyor. **Diğer birçok maddenin (tracing, audit,
idempotency) altyapısı.** En yüksek getiri.

### 3.2 Idempotency — `core/http/idempotency.ts`
`Idempotency-Key` başlığı → `CacheStore`'da (zaten var) ilk cevabı sakla, aynı
anahtarla gelen tekrarı yeniden çalıştırmadan aynı cevabı dön. Ağ kopmasında
tekrarlanan POST çift kayıt üretmesin (aynı kulüp başvurusu iki kez). Uçuştaki
isteği kilitlemek gerekir (aynı anahtarla iki eşzamanlı istek → biri 409).

### 3.3 Timeout / deadline — `core/http/timeout.ts`
Asılı kalan bir istek bağlantıyı ve DB havuzundan bir slot'u süresiz tutar; birkaç
tanesi tüm havuzu yer (ucuz DoS). `hono/timeout` var ama cevabı bizim zarfımıza
bağlamak için ince bir sarmalayıcı gerekir (`RequestTimeoutError`, 408/503).

### 3.4 Koşullu GET / ETag — `core/http/etag.ts`
Public okumalar (üniversite/fakülte listeleri — zaten cache'li) için `ETag` +
`If-None-Match` → 304. Bant genişliği ve serialization maliyetini düşürür.
`hono/etag` üzerine ince bir kurulum yeter.

### 3.5 Yük atma (load shedding) — `core/http/concurrency.ts`
Eşzamanlı istek sayısı tavanı; aşılırsa hemen 503 + `Retry-After`. Sonsuz kuyruğa
almak yerine hızlı reddetmek, aşırı yükte sistemin çökmesini önler (rate limit'in
tamamlayıcısı: o kimliğe göre, bu toplam kapasiteye göre korur).

### 3.6 IP allowlist — `core/http/ip-filter.ts`
`/metrics` bugün kimlik doğrulamasız açık; yorumda "Caddy dışarıya açmamalı"
yazıyor — yani tek savunma proxy config'i. Derinlemesine savunma için bir allowlist
middleware'i (`TRUST_PROXY` ile aynı XFF mantığını paylaşır).

### 3.7 Bakım / salt-okunur modu — `core/http/maintenance.ts`
Migration sırasında yazmaları 503'e düşür, okumalar sürsün. Kill-switch olarak da
işe yarar. Env/Redis'ten okunan bir bayrak; dikişle enjekte edilir.

### 3.8 W3C trace context — `core/context/tracing.ts`
`traceparent` başlığını oku/üret/yay. 3.1'in üstüne oturur; OpenTelemetry'ye
geçilecekse ön koşul. Bugün somut tüketici yok — 3.1 yapılınca değerlenir.

---

## Bilinçli olarak YAPMAYACAKLARIMIZ

Bunları sarmalamak net zarar: bir katman daha, sıfır kazanç.

- **CORS, secureHeaders, compress** — `hono/cors`, `hono/secure-headers`,
  `hono/compress` zaten proje-bağımsız ve iyi. Üstlerine `createCors()` yazmak
  sadece Hono'nun API'sini yeniden isimlendirmek olur. Doğrudan kullan.
- **CSRF** — kimlik `Authorization` başlığında, cookie yok. CSRF cookie tabanlı
  otomatik gönderim saldırısıdır; burada geçerli değil. Eklemek kargo-kült olur.
- **Body parsing / validation** — `createValidator` (core/http/validation.ts)
  zaten var ve zod'a bağlı.
- **Session middleware** — JWT stateless; oturum yok. (Token iptali ayrı bir konu,
  bkz. GUVENLIK_YOL_HARITASI Tier 1.3.)
- **Auth (login/logout) rotaları** — bunlar feature, middleware değil.

---

## Önerilen sıra

1. **3.1 request-context (ALS)** — 3.2/3.8'in ve düzgün loglamanın altyapısı.
2. **Eksik #2 (413 → zarf)** — 15 dakikalık tutarlılık borcu.
3. **Eksik #1 (pipeline + sıra testi)** — düzeni kalıcılaştırır.
4. **3.3 timeout** → **3.2 idempotency** → **3.5 load shedding**.
5. Gerisi (3.4 ETag, 3.6 IP filter, 3.7 maintenance, 3.8 tracing) ihtiyaç doğunca.

Bağlantılı: [GUVENLIK_YOL_HARITASI.md](GUVENLIK_YOL_HARITASI.md) — Tier 1 (login
timing, JWT_SECRET, token iptali) hâlâ açık ve bu listeden önce gelir.
