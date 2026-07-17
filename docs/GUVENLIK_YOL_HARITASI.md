# Güvenlik & Core Yol Haritası

`src/core` proje-bağımsız bir çatı olarak tasarlandı: env okumaz, `shared/`'a hiç
import etmez, projeye özgü her şey dikişlerle (`createX` fabrikası / `configureX` /
`setXSink`) enjekte edilir. Bu dosya o çatının **eksik kalan cross-cutting
yapılarını** ve tespit edilen **güvenlik borcunu** sıraya koyar.

Sıra rastgele değil: önce bugünkü açıklar (ucuz + yüksek etki), sonra taşınabilir
mekanizmalar, en sonda somut tüketicisi henüz olmayanlar. İhtiyaç doğmadan yazılan
soyutlama genelde yanlış soyutlama olur — son grup bilinçli olarak beklemede.

---

## Tier 1 — Bugünkü güvenlik borcu

### 1.1 Login'de timing ile kullanıcı enumeration
**Durum:** Açık. `auth.service.ts` → `login()`

Kod, "hangi e-postaların kayıtlı olduğu sızmasın" diye her iki durumda da aynı
mesajı dönüyor — ama `if (!user) throw` bcrypt'i **atlıyor**. Kullanıcı yoksa
~5 ms, varsa ~100 ms. Mesaj aynı, süre farklı: yan kanal açık. Rate limit e-posta
bazlı olduğu için saldırgan hedef başına birkaç ölçüm alabiliyor.

**Yapılacak:** Kullanıcı bulunamadığında da sabit bir dummy hash'e karşı
`verifyPassword` çalıştır (sonucu at). Taşınabilir hali: `core/auth/password.ts` →
`verifyPasswordOrDummy(password, hash | null)`.

### 1.2 `JWT_SECRET` alt sınırı çok gevşek
**Durum:** Açık. `config/env.ts` → `z.string().min(10)`

HS256 için 10 karakter çevrimdışı brute-force'a açık. Secret kırılırsa token
uydurulur, yani tüm RBAC atlanır.

**Yapılacak:** `core/config/env.ts` → `secretString({ minLength: 32 })` helper'ı:
uzunluk + `changeme`/`secret`/`password` gibi placeholder reddi + prod'da
varsayılana izin vermeme.

### 1.3 Token iptali (revocation) mekanizması yok
**Durum:** Açık. Kod tabanında `logout` / `jti` / `refreshToken` geçmiyor.

7 günlük stateless JWT ve onu geçersiz kılmanın hiçbir yolu yok:
- Logout gerçekten logout değil — token 7 gün daha geçerli.
- Şifre değiştirmek diğer oturumları öldürmez.
- Çalınan token 7 gün yaşar.

Not: hesap askıya alma **çalışıyor** — `status` authz cache'inde ve `attachAuthz`
her istekte bakıyor. Mekanizmanın yarısı zaten yerinde; eksik olan token boyutu.

**Yapılacak:** `core/auth/revocation.ts` — bir `RevocationStore` portu
(`CacheStore` deseninin aynısı). İki strateji:
- `jti` denylist'i (TTL = token'ın kalan ömrü → kendiliğinden temizlenir), veya
- **session epoch**: claim'e `tokenVersion`, authz'a da aynısı. `attachAuthz`
  zaten Redis'e gittiği için karşılaştırma ~sıfır maliyet. Şifre değişince epoch
  artar → tüm oturumlar düşer. **Tercih edilen: bu.**

---

## Tier 2 — Taşınabilir mekanizmalar

### 2.1 Rate limiting → `core/ratelimit` ✅ TAMAMLANDI
Ders kitabı cross-cutting concern'ü ve core'a girmemiş son büyük mekanizmaydı.
`RateLimitStore` portu + `createRateLimiter` fabrikası + memory/redis adaptörleri.
Kampüs-NAT gerekçesi ve hazır limitler projede (`middlewares/rate-limit.middleware.ts`).

### 2.2 Core birim testleri ✅ TAMAMLANDI (ilk parti)
Core'un taşınabilir olmasının bütün amacı buydu ve kaçırılıyordu: tüm testler
Postgres/Redis isteyen entegrasyon testleriydi. Core'un yarısı saf fonksiyon.
`tests/unit/` altında, altyapı gerektirmeden koşar.

Kalan: `BaseRepository` guard'ları (buildWhere/requireScopedWhere — sahte db ile),
`createErrorHandler` sınıflandırma sırası, `createValidator`.

### 2.3 Adaptif / kayan pencere rate limit
Mevcut sabit pencere, pencere sınırında 2× burst'e izin verir. Daha önemlisi:
e-posta bazlı limit tek hesaba brute-force'u durdurur ama **dağıtık credential
stuffing**'i (10.000 hesaba 1'er deneme) hiç görmez — her sayaç 1'de kalır.

**Yapılacak:** `core/ratelimit`'e sliding-window adaptörü + global anomali sayacı
(başarısız login toplamı) + kademeli hesap kilidi.

### 2.4 İstek bağlamı (AsyncLocalStorage)
`requestId` elle taşınıyor; sadece request-logger ve error-handler görüyor. Servis
veya kuyruk worker'ı log yazınca korelasyon kimliği düşüyor → zincir takip edilemiyor.

**Yapılacak:** `core/context/request-context.ts` (ALS `run`/`get`) + bağlam-farkında
child logger.

### 2.5 Nesne seviyesi yetkilendirme (IDOR)
OWASP API Security #1. `guard()` "bu rol genel olarak duyuru silebilir mi" der;
"bu duyuru bu çağıranın kulübüne mi ait" demez. `enforceTenantScope` yalnızca path
param'ını karşılaştırır. İç içe kaynaklarda (duyuru → kulüp → üniversite) zincir
servis içinde elle kuruluyor ve `club.middleware` `guard()`'dan geçmediği için
audit'e de düşmüyor.

**Yapılacak:** `core/authz/policy.ts` — route'tan değil **servis katmanından**
çağrılabilen `can(subject, action, resource)`. `guard()`'ın eksik ikinci yarısı.

### 2.6 Health check registry (liveness/readiness ayrımı)
`index.ts` içinde elle yazılmış, yerel bir `withTimeout` ile — oysa `shutdown.ts`
tam da gereken registry desenini zaten uyguluyor. Davranışsal sorun: Redis anlık
kopunca `/health` 503 dönüyor ve LB instance'ı havuzdan çıkarıyor, halbuki
uygulama sağlıklı (rate-limit ve cache zaten fail-open).

**Yapılacak:** `core/http/health.ts` → `createHealthCheck({ checks })`; liveness
(bağımlılığa bakmaz) ve readiness ayrı.

### 2.7 Kuyruk/job soyutlaması
BullMQ doğrudan `features/auth/auth.queue.ts` içinde. Retry/backoff/DLQ/
graceful-drain/job metrikleri hepsi cross-cutting. Outbox (Tier 3) zaten bir kuyruk
dikişi gerektirecek.

**Yapılacak:** `core/jobs`.

### 2.8 Idempotency
`Idempotency-Key` middleware'i yok → ağ kopmasında tekrarlanan POST çift kayıt
üretir (aynı kulüp başvurusu iki kez). `CacheStore` zaten var; ~60 satır.

### 2.9 Refresh token rotation + reuse detection
7 gün access token yerine 15 dk access + rotating refresh. **Reuse detection**
kritik: zaten döndürülmüş bir refresh token tekrar sunulursa bu, token hırsızlığının
tek pratik kanıtıdır → o ailenin tamamı iptal edilir. Her projede yeniden yazılan ve
genelde yanlış yazılan bir şey; core'da doğru bir kez durması değerli.

### 2.10 Secret rotation (`kid` ile çok-anahtarlı verify)
`JWT_SECRET`'i bugün değiştirmek tüm kullanıcıları anında atar. Rotasyon, eski
anahtarla doğrulamaya devam edip yenisiyle imzalamayı gerektirir.

---

## Tier 3 — Somut tüketicisi doğunca

Bunlar bilinçli olarak **beklemede**: bugün onları kullanan bir kod yolu yok.

- **HMAC imzalama + replay koruması** (`core/security/hmac.ts`) — sabit zamanlı
  karşılaştırma, timestamp penceresi, nonce. Webhook / servisler arası çağrı /
  ödeme sağlayıcısı entegrasyonunda gerekecek.
- **Alan bazlı şifreleme** (`core/security/crypto.ts`, AES-256-GCM envelope) —
  KVKK kapsamındaki alanlar (TC, telefon, sağlık) şu an düz. Yanına **blind index**
  (deterministik hash) gerekir, yoksa şifreli alanda arama yapılamaz.
- **SSRF guard** (`core/security/url-guard.ts`) — bugün fetch yüzeyi **yok**
  (doğrulandı). İlk "linkin önizlemesini çekelim" / "logoyu indirip thumbnail
  üretelim" isteğinde gerekir: şema allowlist + DNS çözüp private/link-local
  aralık reddi (`169.254.169.254` cloud metadata).
- **Outbox** — bkz. observability yol haritası, Tier 3.
- **Anomali tespiti / alerting** — audit log var ama "aynı kullanıcı 1 dakikada
  50 kulübe başvurdu" gibi bir sinyal yok.
- **OpenAPI** — zod şemaları zaten var; `@hono/zod-openapi` ile üretilebilir.

---

## Sınır kuralı (bozulmasın)

`core/` bugün `shared/` veya `config/env`'e **hiç** import etmiyor (grep yalnızca
yorum satırlarını buluyor). Bunu koruyan otomatik bir mekanizma **yok** — yarın biri
`core/`'a `import { env }` yazsa hiçbir şey durdurmaz.

**Yapılacak:** `core/**` importlarını tarayıp `shared|config|features`'a izin
vermeyen bir sınır testi. Düzeni kalıcılaştırır.
