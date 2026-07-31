# Tenant ayarları — Frontend entegrasyon

**Kapsam:** `GET/PATCH /api/universities/:universityId/settings` — tenant başına politika tuşları (sabitleme kotası, okul geneli duyuru hızı).

> Hata zarfı: [error-and-audit.md](../reference/error-and-audit.md). Auth: [auth-guards.md](auth-guards.md).

---

## Yetki

| İşlem | Permission | Tenant scope |
|---|---|---|
| GET / PATCH | `university.settings.manage` | Evet (`:universityId` = kendi tenant) |

`super_admin` tenant scope bypass eder. `university_admin` seed'de bu yetkiyi taşır.

**Platform anahtarı:** `announcement.university.publish.per_hour` yalnızca platform operatörü (`super_admin` bypass veya `platform.tenant.manage`) PATCH edebilir; tenant yöneticisi `403`.

---

## GET — çözümlenmiş ayarlar + metadata

```
GET /api/universities/:universityId/settings
Authorization: Bearer <token>
```

**200 `data`** — anahtar → nesne:

```json
{
  "announcement.club.pinned.max": {
    "value": 3,
    "default": 3,
    "min": 0,
    "max": 10,
    "editor": "tenant",
    "labelTr": "Kulüp sabitleme kotası",
    "labelEn": "Club pinned announcement limit"
  },
  "announcement.university.pinned.max": { ... },
  "announcement.university.publish.per_hour": {
    "value": 5,
    "default": 5,
    "min": 1,
    "max": 100,
    "editor": "platform",
    ...
  }
}
```

- `value`: bugün geçerli çözümlenmiş değer (DB sapması + varsayılan).
- `editor`: `"tenant"` | `"platform"` — UI'da düzenlenebilirlik.
- Ayar ekranını bu yanıttan kurun; sabitleri frontend'e gömmeyin.

---

## PATCH — kısmi güncelleme

```
PATCH /api/universities/:universityId/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "settings": {
    "announcement.club.pinned.max": 5,
    "announcement.university.pinned.max": null
  }
}
```

- Yalnızca gönderilen anahtarlar güncellenir.
- `null` → varsayılana dönüş (DB satırı silinir).
- Değer = katalog `default` ile aynıysa satır silinir (seyrek model).
- Sınır dışı → `400`. Platform anahtarı + tenant yönetici → `403`.

Değişiklik anında etkilidir (cache SET); TTL beklenmez.

---

## Ayar anahtarları (v1)

| Anahtar | Varsayılan | Sınır | Düzenleyen |
|---|---|---|---|
| `announcement.club.pinned.max` | 3 | 0–10 | tenant |
| `announcement.university.pinned.max` | 3 | 0–10 | tenant |
| `announcement.university.publish.per_hour` | 5 | 1–100 | platform |

---

## UI önerisi

1. GET ile formu doldur.
2. `editor === "platform"` satırlarını tenant panelinde salt-okunur göster (platform paneli ayrı).
3. PATCH ile yalnızca değişen alanları gönder.
4. "Sıfırla" = ilgili anahtara `null` gönder.
