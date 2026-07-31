# Tenant askısı — ölçeklenebilir invalidation tasarım notu

**Durum:** Uygulandı (2026-07-31)  
**İlgili:** [ADR 0009](../adr/0009-tenant-status-in-authz-cache.md)

## Problem

`PATCH /api/platform/tenants/:id/status` askıya aldığında `updateTenantStatus`
tenant'ın **tüm** kullanıcı kimliklerini çekip `invalidateUsersPermissions` ile
tek tek Redis anahtarını siliyordu. 50.000 öğrencili bir tenant'ta tek operatör
isteği ≈ 50.000 `DEL` — panel yanıt süresi ve Redis yükü ölçekle ters orantılı.

## Uygulanan mekanizma

1. **Kullanıcı cache** (`rbac:permissions:<userId>`) yalnızca rol/yetki/hesap
   `status` taşır — tenant `status` kaldırıldı.
2. **Tenant durum cache** — tek anahtar: `rbac:tenant-status:<universityId>` →
   `{ status, deleted }`, TTL **60 sn**.
3. `enforceAuthzPolicy` ve login/register yolları tenant kontrolünü bu anahtardan
   okur; miss'te `findTenantStatusSnapshot` ile doldurur.
4. Tenant status PATCH sonrası `setTenantStatusCache` (**SET**, anında kesim) —
   kullanıcı bazlı invalidate **kaldırıldı**.

## Askı hâlâ “bir sonraki istekte” etkili mi?

**PATCH yolunda evet, anında.** `SET` ile tenant-status anahtarı güncellenir;
sonraki istek askıyı görür. Yalnızca cache miss + TTL yolunda ≤60 sn eski değer
tutulabilir — bilinçli tutarsızlık penceresi (bkz. ADR 0009 revizyon notu).

| TTL | Tutarsızlık penceresi | Redis yükü |
|---|---|---|
| 0 (her istekte DB) | Yok | Yüksek |
| 60 sn | PATCH dışı yollarda ≤60 sn | Düşük |
| 300 sn | ≤5 dk | Çok düşük |

Seçilen: **60 sn** + PATCH sonrası **SET** (TTL beklemeden kesim).

## Uygulama öncesi doğrulanacaklar (cevaplar)

- **`past_due` ve `trial`:** Aynı tenant-status anahtarında; `tenantBlocksAccess`
  yalnızca `suspended` ve soft-delete'i reddeder — `trial`/`active`/`past_due` serbest.
- **Soft-delete:** Ayrı `deleted: boolean` bayrağı; `status` null + `deleted: true`
  → erişim/kayıt reddi (suspended ile aynı politika yüzeyi).
- **Platform operatörleri:** `universityId = null` → `enforceTenantStatus` erken çıkış;
  tenant-status okunmaz.

## Bu notun kapsamı

Yalnızca **4b** (askı invalidation ölçeği). Tenant listesi keyset sayfalama (4a)
ayrı uygulandı — `(createdAt DESC, id DESC)` bileşik opak cursor.
