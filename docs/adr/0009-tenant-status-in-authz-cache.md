# ADR 0009 — Tenant `status` authz cache'e gömülüp middleware'de zorlanır

**Durum:** Kabul edildi  
**Tarih:** 2026-07-31

## Revizyon (2026-07-31)

**Ne değişti:** Karar §1–2 ve Sonuçlar maddesi. Tenant `status` artık kullanıcı authz
cache'ine (`rbac:permissions:<userId>`) **gömülmez**; tek anahtar
`rbac:tenant-status:<universityId>` (60 sn TTL) üzerinden okunur. Tenant status PATCH
sonrası `invalidateUsersPermissions` yerine tenant-status anahtarı **doğrudan SET** ile
güncellenir (TTL beklemeden anında kesim).

**Neden:** Büyük tenant'ta askı tek istekte on binlerce `DEL` üretiyordu; operatör paneli
yanıt süresi ve Redis yükü tenant kullanıcı sayısıyla ters orantılı büyüyordu.

**Bilinçli kabul:** PATCH yolunda SET ile anında kesim vardır; yalnızca cache miss +
TTL yolunda (ör. yeni tenant, Redis flush) ≤60 sn gecikme mümkündür. Bu, ölçek
karşılığında kabul edilen tutarsızlık penceresidir.

**Değişmedi:** `enforceAuthzPolicy` (`shared/rbac/authz-policy.ts`) tek politika noktası
olarak kalır — hem `attachAuthz` hem `requireActiveUser` buradan tenant askısını zorlar;
yalnızca tenant status **kaynağı** ayrı cache anahtarına taşındı.

## Bağlam

Tenant askıya alındığında (`universities.status = suspended`) veya soft-delete
edildiğinde o üniversitenin kullanıcılarının erişimi kesilmeli. JWT'de tenant
durumu taşınmaz (7 günlük token); her istekte DB sorgusu da maliyetli. Self-service
rotalar (`/api/clubs`, `/api/users`, …) `guard()` kullanmaz — yalnızca
`requireActiveUser` ile hesap `status` kontrol edilirse tenant askısı bu yüzeyde
etkisiz kalır.

## Karar

1. `rbac.repository.getEffectiveRolesAndPermissions` yalnızca rol/yetki/hesap `status`
   taşır — tenant `status` **dahil değil**.
2. Tenant durumu `rbac:tenant-status:<universityId>` anahtarında (`{ status, deleted }`,
   60 sn TTL). Miss'te `findTenantStatusSnapshot` (soft-delete dahil) doldurur.
   Status PATCH sonrası anahtar **SET** ile güncellenir; kullanıcı bazlı invalidate **yok**.
3. `enforceAuthzPolicy` (`shared/rbac/authz-policy.ts`) hem `attachAuthz` hem
   `requireActiveUser` tarafından çağrılır — hesap askısı + tenant askısı tek nokta.
   Tenant kontrolü `resolveTenantStatus` üzerinden async okunur.
4. Login/register yolları aynı tenant-status cache'ini kullanır (`tenantBlocksAccess`).

## Gerekçe

- Askı PATCH yolunda anında etkili (SET); büyük tenant'ta invalidate maliyeti O(1).
- guard()'lı ve guard()'sız rotalar aynı politikayı paylaşır.
- Core RBAC tenant kavramını bilmez; politika `shared/rbac/authz-policy.ts`'te kalır
  ([ADR 0003](0003-core-shared-portability-boundary.md)).

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| Yalnızca `attachAuthz` / guard rotalarında kontrol | Self-service yüzeyi açık kalır |
| JWT'ye `tenantStatus` gömme | Token süresi boyunca gecikme; revoke zor |
| Her istekte `universities` tablosuna sorgu | Yüksek trafikte gereksiz DB baskısı |
| Kullanıcı authz cache'ine tenant status gömme + invalidate | Ölçekte O(n) Redis `DEL` (revizyon öncesi model) |

## Sonuçlar

- Tenant status PATCH sonrası yalnızca tenant-status anahtarı güncellenir.
- Testler guard'sız öğrenci yüzeyinde (ör. `GET /api/clubs`) askıyı doğrular.
- `past_due` ve `trial` erişimi kesmez; `suspended` ve soft-delete keser.
- Platform hesapları (`universityId = null`) tenant-status okumasından muaf.
