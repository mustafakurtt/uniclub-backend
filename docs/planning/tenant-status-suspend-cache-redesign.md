# Tenant askısı — ölçeklenebilir invalidation tasarım notu

**Durum:** Değerlendirme bekliyor (2026-07-31)  
**İlgili:** [ADR 0009](../adr/0009-tenant-status-in-authz-cache.md)

## Problem

`PATCH /api/platform/tenants/:id/status` askıya aldığında `updateTenantStatus`
tenant'ın **tüm** kullanıcı kimliklerini çekip `invalidateUsersPermissions` ile
tek tek Redis anahtarını siliyor. 50.000 öğrencili bir tenant'ta tek operatör
isteği ≈ 50.000 `DEL` — panel yanıt süresi ve Redis yükü ölçekle ters orantılı.

Bugünkü ADR 0009 kararı: tenant `status` **kullanıcı authz cache'ine gömülü**
(`AuthzContext.tenantStatus`); değişince kullanıcı bazlı invalidate şart.

## Önerilen mekanizma

Tenant durumunu kullanıcı cache'inden **ayırmak**:

1. **Kullanıcı cache** (`rbac:permissions:<userId>`) yalnızca rol/yetki/hesap
   `status` taşır — tenant `status` alanı kaldırılır veya her okumada doğrulanmaz.
2. **Tenant durum cache** — tek anahtar: `rbac:tenant-status:<universityId>` →
   `{ status, deletedAt? }`, kısa TTL (öneri: **60 sn**).
3. `enforceAuthzPolicy` ve login/register yolları tenant kontrolünü bu anahtardan
   okur; miss'te `findStatusById` (soft-delete filtreli) ile doldurur.
4. Tenant status PATCH veya soft-delete sonrası yalnızca **bir** `DEL` (veya
   `SET` ile anında güncelleme) — kullanıcı bazlı invalidate **gerekmez**.

## Askı hâlâ “bir sonraki istekte” etkili mi?

**Evet, pratikte.** Invalidate anında tenant-status anahtarı düşer veya güncellenir;
sonraki istekte (cache miss veya güncel değer) askı uygulanır. TTL penceresi
boyunca eski `active` değeri tutulabilir — bu **bilinçli tutarsızlık penceresi**.

| TTL | Tutarsızlık penceresi | Redis yükü |
|---|---|---|
| 0 (her istekte DB) | Yok | Yüksek |
| 60 sn | Askı sonrası ≤60 sn erişim devam edebilir | Düşük |
| 300 sn | ≤5 dk | Çok düşük |

Öneri: **60 sn** — operatör askısı kampüs ölçeğinde saniyeler içinde yayılmalı;
tam anlık kesim gerekiyorsa PATCH sonrası anahtarı `SET suspended` ile güncelle
(TTL beklemeden).

## ADR 0009'da değişecek maddeler

| Mevcut ADR 0009 maddesi | Değişiklik |
|---|---|
| Karar §2: Redis cache tenant `status` **gömer** | Tenant status ayrı anahtarda; kullanıcı cache'inde değil |
| Karar §2: tenant durumu değişince `invalidateUsersPermissions` | Tenant-status anahtarını güncelle/sil; kullanıcı invalidate kaldırılır |
| Sonuçlar: PATCH sonrası ilgili tenant kullanıcılarının cache'i temizlenir | PATCH sonrası yalnızca tenant-status anahtarı |
| Elenen: her istekte DB sorgusu | Hâlâ elenmiş değil — kısa TTL + tek anahtar DB'yi her istekte çağırmaz |

`enforceAuthzPolicy` tek nokta kalır; yalnızca tenant status **kaynağı** değişir.

## Uygulama öncesi doğrulanacaklar

- `past_due` ve `trial` politikası aynı tenant-status anahtarında mı?
- Soft-delete: tenant-status `suspended` veya ayrı `deleted` bayrağı?
- Platform operatörleri (`universityId = null`) tenant-status okumasından muaf.

## Bu notun kapsamı

Yalnızca **4b** (askı invalidation ölçeği). Tenant listesi keyset sayfalama (4a)
bu notun dışında, ayrı uygulandı.
