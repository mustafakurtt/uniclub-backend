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
  },
  "club.application.approval_chain": {
    "value": ["club_approver"],
    "default": ["club_approver"],
    "kind": "role_chain",
    "allowedRoles": ["club_approver", "advisor", "student_affairs", "university_admin", ...],
    "editor": "tenant",
    "labelTr": "Kulüp başvuru onay zinciri (kademe → rol)",
    "labelEn": "Club application approval chain (step → role)"
  }
}
```

- `value`: bugün geçerli çözümlenmiş değer (DB sapması + varsayılan).
- `kind`: `"integer"` | `"role_chain"` | `"boolean"` — boolean bayraklar için `flagType` (`entitlement` | `release`) ve `release` için `sunsetAfter` (`YYYY-MM-DD`) metadata'da gelir.
- `editor`: `"tenant"` | `"platform"` — UI'da düzenlenebilirlik.
- Ayar ekranını bu yanıttan kurun; sabitleri frontend'e gömmeyin.

### Özellik bayrakları (`kind: boolean`)

Tenant başına özellik aç/kapa (pilot yayın). `flagType`:

- `entitlement` — kalıcı yetkilendirme (ör. `university.export.enabled`)
- `release` — geçici yayın bayrağı; katalogda `sunsetAfter` **zorunlu**

Kapalı bayrakla korunan rotalar `requireFeature(key)` middleware'i ile **404** döner (403 değil). Yetki kontrolü (`guard`) bayraktan önce çalışır: yetkisiz kullanıcı bayrak açık olsa bile 403 alır.

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
| `club.application.approval_chain` | `["club_approver"]` | 1–3 kademe, `allowedRoles` katalogda | tenant |
| `club.formation.support_threshold` | `0` | 0–500 (0 = destek toplama kapalı, doğrudan başvuru) | tenant |
| `club.formation.proposal_expiry_days` | `90` | 7–180 | tenant |
| `university.export.enabled` | `false` | boolean, `flagType: entitlement` | platform |
| `university.export.pdf.enabled` | `false` | boolean, `flagType: release`, `sunsetAfter: 2026-11-01` | platform |

`club.application.approval_chain` — JSON dizi: her eleman bir kademenin karar verici rolü.
`club_approver` özel token: `club.approve` yetkisini taşıyanlar. Örnek iki kademe:
`["advisor", "student_affairs"]` (seed'de Ege Bilim). Varsayılan tek kademe mevcut
tenant'larda davranışı değiştirmez.

---

## UI önerisi

1. GET ile formu doldur.
2. `editor === "platform"` satırlarını tenant panelinde salt-okunur göster (platform paneli ayrı).
3. PATCH ile yalnızca değişen alanları gönder.
4. "Sıfırla" = ilgili anahtara `null` gönder.
