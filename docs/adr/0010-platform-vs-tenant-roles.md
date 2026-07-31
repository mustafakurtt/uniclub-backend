# ADR 0010 — Platform rolü ↔ tenant rolü ayrımı

**Durum:** Kabul edildi  
**Tarih:** 2026-07-31

## Bağlam

RBAC kataloğunda 9 kurumsal rol tanımlı; bunların yalnızca ikisi platform
katmanına aittir (`super_admin`, `platform_support`). Tenant personeli
(`university_admin`, `student`, …) JWT'de sabit `universityId` taşır; platform
hesapları `universityId = null`. Aynı rol tablosunu paylaşırlar ama atanma
kuralları, tenant-scope bypass ve UI layout beklentileri farklıdır.

## Karar

1. **Platform rolleri** (`super_admin`, `platform_support`): `roles.universityId = null`,
   `users.universityId = null`. Yalnızca `super_admin` platform rolleri atayabilir
   (`PLATFORM_ROLE_NAMES`, `assertRoleAssignable`).
2. **Tenant rolleri**: `users.universityId` zorunlu (öğrenci/hoca/yönetici);
   tenant'a özel roller `roles.universityId` ile tenant'a bağlanabilir.
3. **Çapraz-tenant bypass**: `super_admin` ve `platform_support` için
   `configureTenantScope.bypassRoles` — drill-down destek senaryoları.
4. **Platform hesabı oluşturma**: `POST /api/platform/users` doğrudan `super_admin`
   rolüyle korunur; ayrı `platform.user.manage` permission yok (atama kuralıyla
   çelişirdi).

## Gerekçe

- Yetki yükseltme: tenant yöneticisi kendine `super_admin` mintleyemez.
- Ürün: platform layout tenant seçici kullanır; tenant layout JWT tenant'ına kilitli.
- Seed'de 2 platform rolü MVP için yeterli; granülerlik permission ile genişler
  ([platform-rbac.md](../planning/platform-rbac.md)).

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| `platform.user.manage` permission + platform_support'a atama | `assertRoleAssignable` platform rol atamayı engeller — yarım uygulama |
| Platform ve tenant için ayrı `roles` tabloları | Aynı RBAC motoru, çift katalog bakımı |
| Platform hesaplarına tenant rolü vermek | Tenant scope ve self-service rotalarında belirsizlik |

## Sonuçlar

- Yeni platform rolü: `ROLE_DEFS`, `PLATFORM_ROLE_NAMES`, `bypassRoles` güncellemesi.
- Tenant rolleri platform panel menüsünde rol olarak düşünülmez.
- İlgili: [ADR 0008](0008-platform-feature-boundary.md), [ADR 0004](0004-nine-role-rbac-with-rank.md).
