# Güvenlik ve Core Yol Haritası

`src/core` proje-bağımsız çatıdır; proje özelindeki her şey dikişlerle enjekte edilir.

Tamamlanan mekanizmalar (rate limit core'a taşındı, core unit testleri, health registry):
[archive/schema-tiers-completed.md](archive/schema-tiers-completed.md) ve [architecture/core-middleware.md](../architecture/core-middleware.md).

---

## Tier 1 — Bugünkü güvenlik borcu

### 1.1 Login timing / kullanıcı enumeration

Uygulandı: `verifyPasswordOrDummy` (`core/auth/password.ts`) + login her istekte hash doğrular.

### 1.2 `JWT_SECRET` alt sınırı

Uygulandı: min 32 karakter, placeholder reddi, prod örnek yasak (`config/jwt-secret.ts`).

### 1.3 Token iptali (revocation)

Uygulandı (2026-07-31): `users.token_version` + JWT claim; karşılaştırma `enforceAuthzPolicy` içinde authz snapshot'tan — blocklist yok. Detay: [session-revocation-and-password-reset.md](session-revocation-and-password-reset.md).

---

## Tier 2 — Taşınabilir mekanizmalar (açık)

| # | Konu | Özet |
|---|---|---|
| 2.3 | Adaptif rate limit | Sliding window + global başarısız login sayacı |
| 2.4 | İstek bağlamı (ALS) | `requestId` servis/worker loglarına taşınsın |
| 2.5 | Nesne seviyesi yetkilendirme | IDOR — `can(subject, action, resource)` |
| 2.6 | Health registry | Liveness/readiness ayrımı (kısmen `core/http/health.ts`) |
| 2.7 | Kuyruk soyutlaması | BullMQ `core/jobs` arkasına |
| 2.8 | Idempotency | `Idempotency-Key` middleware |
| 2.9 | Refresh token rotation | 15 dk access + rotating refresh + reuse detection |
| 2.10 | Secret rotation | `kid` ile çok-anahtarlı JWT verify |

**Sınır testi:** `core/**` → `shared|config|features` import yasağı — `tests/unit/core-boundary.test.ts`.

---

## Tier 3 — Tüketici doğunca

HMAC/replay, alan şifreleme (KVKK), SSRF guard, transactional outbox, anomali alerting, **OpenAPI**.

Outbox: [architecture/notifications.md](../architecture/notifications.md), [operations/logging.md](../operations/logging.md).
