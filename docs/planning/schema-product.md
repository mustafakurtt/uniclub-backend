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
| Tier 0.4 `onDelete` | Kapandı | [activities-schema-fk-debt.md](activities-schema-fk-debt.md) — migration `20260731185647` |
| Tier 1.1 çapraz-tenant | Kapandı | `assertCanRsvp` servis katmanında; aynı not |

Entegrasyon: [integration/activities.md](../integration/activities.md).

---

## Tier 2 — SaaS ürün katmanı

### 2.1 Tenant yaşam döngüsü ve yapılandırma

- `universities.status` (`trial` / `active` / `past_due` / `suspended`) — uygulandı; askı ve soft-delete authz cache + login/register'da zorlanır
- `tenant_settings` — **kapandı (C1):** sabitleme kotası + okul geneli duyuru hızı; seyrek model + cache. Bkz. [tenant-settings-cache.md](../architecture/tenant-settings-cache.md), [integration/tenant-settings.md](../integration/tenant-settings.md)
- `timezone`, `defaultLocale`, branding (`logoUrl`, `primaryColor`) — **kapandı (C2):** `universities` kolonları; `university.update` ile tenant yönetici düzenler

### 2.2 Plan / abonelik / kota

`plans`, `subscriptions`, kullanım sayaçları. 2.1'den sonra.

### 2.3 Tenant onboarding (kısmi)

Runbook: [operations/tenant-onboarding.md](../operations/tenant-onboarding.md).

**Kalan:** branding alanları onboard body'de isteğe bağlı (PATCH ile de ayarlanabilir).

### 2.4 Self-servis şifre sıfırlama

Uygulandı (2026-07-31): `password_resets` tablosu + `POST /api/auth/forgot-password` / `POST /api/auth/reset-password`; `tokenVersion` artışı ile oturum iptali. Detay: [session-revocation-and-password-reset.md](session-revocation-and-password-reset.md).

---

## Tier 3 — Alan derinliği

### 3.1 Etkinlikler

**Durum:** Uygulandı (`/api/activities`). Kalan borç: yukarıdaki merge maddeleri.

### 3.2 Duyuru yaşam döngüsü

**Durum:** Uygulandı — kulüp duyuruları (`/api/clubs/:clubId/announcements`) ve okul
geneli duyurular (`/api/universities/:universityId/announcements`, B2). `status`,
`publishedAt`, `pinned`, `visibility` — etkinliklerle aynı enum'lar; duyuruda
`cancelled` kullanılmaz.

**Okul geneli model:** `announcements.club_id` nullable — `NULL` = tenant yayını
(oryantasyon, akademik takvim, SKS). Tenant kilidi: Postgres `MATCH SIMPLE` ile
bileşik `(club_id, university_id) → clubs` FK yalnızca `club_id` dolu satırlarda
uygulanır; okul geneli satırlarda `university_id → universities` FK tenant'ı garanti
eder (kilit delinmedi).

**Elenen alternatifler:**
- **Polimorfik yayıncı** (`publisher_type` + `publisher_id`): bileşik FK ile tenant
  kilidi kurulamaz; çapraz-tenant sapması riski.
- **Üniversite başına "sistem kulübü"**: sahte kulüp üyelik/başvuru/rol sızıntısı;
  her kulüp sorgusuna `WHERE slug != 'sistem'` filtresi.

**Okul geneli fan-out guardrail (karar):** Bildirim tipi `announcement.university.published`
— **susturulabilir** (`optOutable`). Yayınlama uçunda tenant+yayıncı başına **saatte 5**
hız sınırı. Fan-out **500 alıcıdan büyükse** BullMQ kuyruğuna (`notification-fanout`);
küçük tenant'ta `notifyManySafe` istek içinde senkron kalır.

### 3.3 Akademik dönem

`academic_terms` + `clubMembers.termId`; tam giriş-çıkış tarihçesi (PK refactor ile birlikte).

### 3.4 Medya varlıkları

`media` feature var; `media_assets` tablosu + depolama kotası (2.2 ile birlikte).

---

## Tier 4 — Doküman

**4.4 OpenAPI** — `@hono/zod-openapi` + Swagger UI. Elle sürdürülen [reference/api.md](../reference/api.md) uzun vadede türetilmiş spec'e indirgenmeli.

Tamamlanan 4.1–4.3, 4.5–4.6: archive kaydında.
