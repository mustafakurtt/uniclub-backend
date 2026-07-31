# Tenant ayarları cache ekseni

**Durum:** Uygulandı (C1, 2026-08-01)  
**İlgili:** `src/shared/rbac/tenant-status.cache.ts`, [cache README](cache/README.md)

---

## Amaç

Tenant başına politika tuşları (sabitleme kotası, yayın hızı) kod kataloğunda varsayılan taşır; DB yalnızca sapmaları tutar. Okuma yolu `getTenantSettings(universityId)` — tam çözümlenmiş, tipli nesne; çağıranlar kendi varsayılan birleştirmesi yapmaz.

---

## Cache deseni

| Özellik | tenant-status | tenant-settings |
|---|---|---|
| Namespace | `rbac:tenant-status` | `tenant:settings` |
| TTL | 60 sn | 300 sn |
| Güncelleme | `setTenantStatusCache` (anında) | `setTenantSettingsCache` (anında) |
| Hata davranışı | **fail-closed** (null → erişim reddi) | **fail-open** (varsayılanlara düş) |

**Neden farklı?** Tenant durumu güvenlik kapısı: askıya alınmış tenant'a erişim açılmamalı, Redis düşse bile. Ayarlar politika tuşu: sabitleme kotası okunamadığında duyuru yayınlanamaması ürünü kırar; koddaki varsayılan (3/3/5) bugünkü sabitlerle birebir aynı.

---

## Okuma / yazma akışı

1. `getTenantSettings` → cache `getOrSet` → DB sapmaları + katalog varsayılanları birleştir.
2. PATCH ayar → DB upsert/delete → `setTenantSettingsCache` (TTL beklemeden).
3. Hız sınırı (`universityAnnouncementPublishLimit`) limit fonksiyonunda `getTenantSettings` çağırır — tenant başına dinamik limit.

---

## Katalog

Tek kaynak: `src/features/tenant-settings/tenant-settings.catalog.ts`. `key` varchar(64) — pgEnum yok; yeni anahtar migration gerektirmez.
