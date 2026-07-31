# Şema ve Ürün Yol Haritası

Aktif borç listesi. Tamamlanan Tier 0/1 kaydı:
[archive/schema-tiers-completed.md](archive/schema-tiers-completed.md).

Güvenlik/core ekseni: [security-core.md](security-core.md).

---

## Öncelik sırası

1. **Merge borcu** (activities/media) — aşağıda
2. **2.1** tenant yaşam döngüsü + ayarlar → **2.4** şifre sıfırlama → **2.2** plan/kota
3. **3.2** duyuru yaşam döngüsü → **3.3** akademik dönem + tam üyelik tarihçesi
4. **4.4** OpenAPI (bkz. security-core §Tier 3)

---

## Merge sonrası açık borç (31 Tem 2026)

`activities`, `dashboard/feed`, `media` birleşmesinden kalan şema işleri:

| Madde | Durum | Not |
|---|---|---|
| Tier 0.4 `onDelete` | Açık | `activities`, `activity_clubs`, `activity_attendees`, `media` FK'lerinde politika yok |
| Tier 1.1 çapraz-tenant | Açık | `activity_attendees` için özel kural gerekli — üniversitelerarası co-host bilinçli; kulüp üyeliği desenini kopyalamayın |

Entegrasyon: [integration/activities.md](../integration/activities.md).

---

## Tier 2 — SaaS ürün katmanı

### 2.1 Tenant yaşam döngüsü ve yapılandırma

- `universities.status` (`trial` / `active` / `past_due` / `suspended`) — uygulandı; askı ve soft-delete authz cache + login/register'da zorlanır
- `tenant_settings` — kulüp kurma kuralları, feature flag, limitler (bugün koda gömülü)
- `timezone`, `defaultLocale`, branding alanları — henüz yok

### 2.2 Plan / abonelik / kota

`plans`, `subscriptions`, kullanım sayaçları. 2.1'den sonra.

### 2.3 Tenant onboarding (kısmi)

Runbook: [operations/tenant-onboarding.md](../operations/tenant-onboarding.md).

**Kalan:** tek çağrıda tenant açan endpoint uygulandı (`POST /api/platform/tenants/onboard`); `tenant_settings` ve branding alanları bekliyor.

### 2.4 Self-servis şifre sıfırlama

Bugün yalnızca yönetici sıfırlaması (`/api/moderation/.../reset-password`).
Şema: `password_resets` (token hash — bkz. [architecture/mail-verification.md](../architecture/mail-verification.md)).

---

## Tier 3 — Alan derinliği

### 3.1 Etkinlikler

**Durum:** Uygulandı (`/api/activities`). Kalan borç: yukarıdaki merge maddeleri.

### 3.2 Duyuru yaşam döngüsü

`status` (draft/published), `publishedAt`, `pinned`, `visibility` (public/members_only).

### 3.3 Akademik dönem

`academic_terms` + `clubMembers.termId`; tam giriş-çıkış tarihçesi (PK refactor ile birlikte).

### 3.4 Medya varlıkları

`media` feature var; `media_assets` tablosu + depolama kotası (2.2 ile birlikte).

---

## Tier 4 — Doküman

**4.4 OpenAPI** — `@hono/zod-openapi` + Swagger UI. Elle sürdürülen [reference/api.md](../reference/api.md) uzun vadede türetilmiş spec'e indirgenmeli.

Tamamlanan 4.1–4.3, 4.5–4.6: archive kaydında.
