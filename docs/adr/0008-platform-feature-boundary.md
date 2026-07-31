# ADR 0008 — Platform operasyonları ayrı `features/platform` katmanı

**Durum:** Kabul edildi  
**Tarih:** 2026-07-31

## Bağlam

SaaS operatör işleri (tenant listesi/stats, suspend, onboard, platform hesapları)
tenant yönetim paneli (`/api/admin`) ile aynı kullanıcı sınıfına ait değil.
Platform hesapları `users.universityId = null`; tenant personeli JWT'de sabit
`universityId` taşır. API yüzeyi ve yetki anahtarları (`platform.tenant.*`) tenant
CRUD (`university.*`) ile karıştırıldığında hem RBAC hem frontend guard'ları
belirsizleşir.

## Karar

- Tenant **profil/akademik yapı CRUD** `features/university` altında kalır
  (`/api/universities`, `university.*` yetkileri).
- Tenant **operasyonel yaşam döngüsü** (liste+stats, status, onboard, invite-admin)
  ve **platform hesapları** `features/platform` altında toplanır (`/api/platform`).
- Alt modüller: `tenants/`, `operator-users/` (ileride `dashboard/`).
- Paylaşılan permission kataloğu: `platform.permissions.ts` + `platform.routes.ts`
  mount birleştirici.

## Gerekçe

- Control-plane vs data-plane sınırı net: operatör API'si tenant-scoped değil.
- `guard()` zinciri ve audit etiketleri feature sınırında tutarlı kalır.
- `university.create` onboard ile paylaşılır; liste/stats platform'a özgü kalır.

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| Tüm tenant işleri `university` feature'ında | Operatör ve okul paneli aynı route ağacında; permission ve mount karmaşası |
| `admin` altına platform rotaları | `admin` zaten tenant drill-down; operatör listesi tenant-scoped değil |
| Tek `platform.service.ts` (alt modül yok) | Onboard + operator-users büyüdükçe katman sözleşmesi bozulur |

## Sonuçlar

- Yeni platform endpoint'leri `src/features/platform/<modül>/` konvansiyonunu izler.
- Frontend tüketici dokümanı: `docs/integration/platform-panel.md`.
- İlgili: [ADR 0010](0010-platform-vs-tenant-roles.md).
