# ADR 0009 — Tenant `status` authz cache'e gömülüp middleware'de zorlanır

**Durum:** Kabul edildi  
**Tarih:** 2026-07-31

## Bağlam

Tenant askıya alındığında (`universities.status = suspended`) veya soft-delete
edildiğinde o üniversitenin kullanıcılarının erişimi kesilmeli. JWT'de tenant
durumu taşınmaz (7 günlük token); her istekte DB sorgusu da maliyetli. Self-service
rotalar (`/api/clubs`, `/api/users`, …) `guard()` kullanmaz — yalnızca
`requireActiveUser` ile hesap `status` kontrol edilirse tenant askısı bu yüzeyde
etkisiz kalır.

## Karar

1. `rbac.repository.getEffectiveRolesAndPermissions` tenant `status` ve soft-delete
   bilgisini okur → `AuthzContext.tenantStatus` (silinmiş tenant = `suspended` gibi).
2. Redis cache (`rbac:permissions:<userId>`) bu bağlamı gömer; tenant durumu
   değişince `invalidateUsersPermissions` çağrılır.
3. `enforceAuthzPolicy` (`shared/rbac/authz-policy.ts`) hem `attachAuthz` hem
   `requireActiveUser` tarafından çağrılır — hesap askısı + tenant askısı tek nokta.
4. Login/register yolları aynı kurala bağlı: `findStatusById` (soft-delete filtreli)
   ve domain→tenant eşlemesi silinmiş üniversiteyi reddeder.

## Gerekçe

- Askı bir sonraki istekte anında etkili (cache invalidate sonrası).
- guard()'lı ve guard()'sız rotalar aynı politikayı paylaşır.
- Core RBAC tenant kavramını bilmez; politika `shared/rbac/authz-policy.ts`'te kalır
  ([ADR 0003](0003-core-shared-portability-boundary.md)).

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| Yalnızca `attachAuthz` / guard rotalarında kontrol | Self-service yüzeyi açık kalır |
| JWT'ye `tenantStatus` gömme | Token süresi boyunca gecikme; revoke zor |
| Her istekte `universities` tablosuna sorgu | Yüksek trafikte gereksiz DB baskısı |

## Sonuçlar

- Tenant status PATCH sonrası ilgili tenant kullanıcılarının cache'i temizlenir.
- Testler guard'sız öğrenci yüzeyinde (ör. `GET /api/clubs`) askıyı doğrular.
- `past_due` bugün erişimi kesmez; ileride politika genişletilebilir.
