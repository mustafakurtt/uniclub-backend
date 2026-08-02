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

**Durum:** Uygulandı (`/api/activities`, `/api/discover/activities`). `activity_visibility` enum'una
`inter_university` eklendi (opt-in; migration mevcut satırları değiştirmez). Kalan borç:
yukarıdaki merge maddeleri.

**Demo sosyal önizleme (salt okunur):** `gallery_social_preview_*` ve
`activity_social_preview_*` tabloları — yalnızca seed ile doldurulur; API'de yazma ucu yok.
Tenant `feed.social.preview` release bayrağı (`sunsetAfter: 2026-11-02`) açık tenant'larda
galeri/etkinlik listelerine `commentCount`, `likeCount`, `recentComments` gömülür.
Gerçek yorum/beğeni özelliği T2.7 kapsamındadır; bu tablolar o zaman moderasyon ve
yazma uçlarıyla değiştirilecek veya kaldırılacaktır.

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

### 3.3 Akademik dönem ve üyelik tarihçesi

- `academic_terms` — tenant kapsamlı (`university_id`); `name`, `startsAt`, `endsAt`, `status` (`open`/`closed`). Aktif dönem: `open` + bugün aralıkta. Çakışan aralıklar Postgres `EXCLUDE` (gist + `tstzrange`) ile reddedilir.
- `club_membership_events` — append-only olaylar (`joined`, `role_changed`, `removed`, `left`, `join_rejected`); `club_members` güncel durumu tutmaya devam eder. `academic_term_id` → `onDelete: restrict` (dönem silme geçmiş veriye bağlıysa engellenir).
- Migration backfill: onaylı ve `left_at IS NULL` üyelikler için `joined` olayı (`joined_at` damgasıyla).
- `club_general_meetings` — genel kurul kaydı (`academic_term_id`, `held_at`, `location`, `meeting_type`, `decisions`); tenant kilidi `club_id` + `university_id`.
- `club_general_meeting_attendees` — katılımcı üyeler (`meeting_id`, `user_id`).
- `club_board_memberships` — yönetim/denetleme kurulu (`board_type`, `seat_type` asil/yedek, `title` unvan); `ended_at` NULL = aktif görev; seçim `general_meeting_id` ile bağlı.
- `club_handover_records` — dönemsel devir teslim (T1.3): `academic_term_id`, `general_meeting_id`, `handover_at`, devreden/devralan kurul anlık görüntüsü (`outgoing_board_snapshot` / `incoming_board_snapshot` JSON), devredilen kalemler (`transferred_items` JSON: bekleyen katılım istekleri, devam eden etkinlikler, danışmanlar). Envanter bu turda yok. Her genel kurul için tek kayıt (`general_meeting_id` unique).
- `approval_committees` / `approval_committee_members` — tenant kapsamlı **kalıcı onay kurulları** (başvuruya özel değil); `club_application_approvals.step_kind = committee_majority` kademesi `committee_id` ile buraya bağlanır.
- `club_application_committee_votes` — kurul oyları (upsert; karar kesinleşene kadar değiştirilebilir); salt çoğunluk üye tam sayısı üzerinden hesaplanır.

### 3.4 Medya varlıkları

`media` feature var; `media_assets` tablosu + depolama kotası (2.2 ile birlikte).

---

## Tier 4 — Doküman

**4.4 OpenAPI** — `@hono/zod-openapi` + Swagger UI. Elle sürdürülen [reference/api.md](../reference/api.md) uzun vadede türetilmiş spec'e indirgenmeli.

Tamamlanan 4.1–4.3, 4.5–4.6: archive kaydında.
