# Planlama — ürün ve platform yol haritası

Bu dosya **sıra ve gerekçe** taşır; ilerleme takibi burada yapılmaz — bkz. [CHANGELOG.md](../../CHANGELOG.md) ve commit geçmişi.

Dağınık borç listeleri: [schema-product.md](schema-product.md) (şema/ürün), [security-core.md](security-core.md) (`core/` ve güvenlik).

---

## Aktif sıra

### A — Güvenlik ve oturum

| Kod | Konu | Kaynak |
|---|---|---|
| **A1** | Güvenlik temizliği (login timing, `JWT_SECRET` sınırı, `core/` sınır testi) | [security-core.md §Tier 1](security-core.md) |
| **A2** | Oturum semantiği — token iptali (session epoch) + self-servis şifre sıfırlama | [security-core.md §1.3](security-core.md), [schema-product.md §2.4](schema-product.md) |

### B — Bildirim tercihleri

Kullanıcı kanal/tür tercihleri; `notifySafe` öncesi filtre. Şema ve ürün detayı henüz ayrı notta toplanmadı — bildirim mimarisi: [architecture/notifications.md](../architecture/notifications.md).

### C — Tenant yapılandırma

| Kod | Konu | Kaynak |
|---|---|---|
| **C1** | `tenant_settings` — kulüp kurma kuralları, feature flag, limitler (bugün koda gömülü) | [schema-product.md §2.1](schema-product.md) |
| **C2** | Tenant profili — `timezone`, `defaultLocale`, branding | [schema-product.md §2.1](schema-product.md) |

### D — Akademik dönem ve üyelik tarihçesi

| Kod | Konu | Kaynak |
|---|---|---|
| **D1** | `academic_terms` şeması | [schema-product.md §3.3](schema-product.md) |
| **D2** | Tam üyelik tarihçesi (`clubMembers.termId`, giriş-çıkış) | [schema-product.md §3.3](schema-product.md) |

### E — Medya varlıkları

`media_assets` tablosu + depolama kotası — [schema-product.md §3.4](schema-product.md), mevcut yükleme: [integration/media.md](../integration/media.md).

### F — Platform dashboard

Operatör paneli özet/istatistik yüzeyleri — [platform-ops-roadmap.md](platform-ops-roadmap.md).

### G — OpenAPI

Elle sürdürülen [reference/api.md](../reference/api.md) → türetilmiş spec + Swagger UI — [schema-product.md §4.4](schema-product.md), [security-core.md §Tier 3](security-core.md).

---

## Park (bilinçli erteleme)

| Konu | Not |
|---|---|
| Billing / kota / abonelik | [schema-product.md §2.2](schema-product.md) — C1 sonrası |
| Impersonation | Operatör destek akışı; henüz tasarım notu yok |
| Çapraz-tenant arama | Platform geneli arama; tenant izolasyonu riski |
| `announcements` CASCADE ↔ `activity_clubs` RESTRICT hizalaması | [activities-schema-fk-debt.md §2](activities-schema-fk-debt.md) — kulüp silme ürün kararı sonrası |

---

## Paralel iz — `core/` taşınabilirlik

[security-core.md §Tier 2](security-core.md) mekanizmaları (adaptif rate limit, ALS, IDOR, health registry genişletmesi, kuyruk soyutlaması, idempotency, refresh rotation, secret rotation) ürün sırasıyla **paralel** ilerleyebilir; her biri `core/`'a taşınabilir mekanizma. Sınır kuralı: [architecture/core-middleware.md](../architecture/core-middleware.md), otomatik doğrulama: `tests/unit/core-boundary.test.ts`.
