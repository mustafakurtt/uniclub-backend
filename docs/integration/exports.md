# Kurumsal rapor dışa aktarma (T4.5)

SKS ve okul yöneticisinin kulüp/üye/etkinlik verisini resmî Excel veya PDF belge olarak indirmesi.

**Yetki:** `university.export.generate` (`university_admin`, `student_affairs` demetlerinde). Rotalar `guard(..., { tenantScoped: true })` ile korunur; POST üretimleri `audit_logs`'a düşer.

**Özellik bayrakları:**

| Anahtar | `flagType` | Açıklama |
|---|---|---|
| `university.export.enabled` | `entitlement` | Tüm export uçları. Kapalı → **404**. Seed: Antalya `true`, diğer tenantlar `false`. |
| `university.export.pdf.enabled` | `release` (`sunsetAfter` zorunlu) | Yalnızca PDF raporları. Kapalı → PDF katalogda yok, üretim **404**; xlsx raporları çalışmaya devam eder. Seed: Antalya `true`. |

Yetki kontrolü bayraktan önce çalışır (yetkisiz → **403**).

## Uçlar

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/universities/:universityId/exports` | Rapor kataloğu (`id`, `labelTr`, `labelEn`, `format`, `parameters`) |
| POST | `/api/universities/:universityId/exports/:reportId` | Rapor üret → dosya gövdesi |

`format`: `"xlsx"` | `"pdf"` — arayüz bu alanı kullanır.

POST yanıtı dosya akışıdır; `Content-Disposition: attachment; filename="<reportId>-<slug>-<param-özeti>.<uzantı>"`.

xlsx üretimi başarısızsa (Bun uyumsuzluğu) **sessiz CSV'ye düşülmez** — UTF-8 BOM + `;` ayırıcılı CSV döner; `X-Export-Fallback: csv` ve `X-Export-Fallback-Reason` başlıkları eklenir. PDF için fallback yok.

## Excel raporları (`format: xlsx`)

### `clubs` — kulüp listesi

```jsonc
{ "status": "approved|pending|rejected|archived", "createdFrom": "ISO-8601", "createdTo": "ISO-8601" }
```

### `club-members` — üye listesi

`clubId` **zorunlu** (UUID). Tenant dışı kulüp → `404`.

```jsonc
{ "clubId": "uuid", "role": "member|officer|president", "status": "pending|approved|rejected" }
```

### `activities` — etkinlik takvimi

```jsonc
{ "from": "ISO-8601", "to": "ISO-8601", "clubId": "uuid", "status": "draft|published|cancelled" }
```

## PDF resmî belgeler (`format: pdf`) — v2

Unicode font gömülü (DejaVu Sans). Kurum adı + tenant `primaryColor` başlıkta; logo yok (v1 kararı). Belge altında imza blokları (unvan, ad, tarih, boş imza alanı).

### `annual-activity-report` — yıllık faaliyet raporu

```jsonc
{ "year": 2026 }
```

`year` zorunlu. İçerik: kurum başlığı, dönem, kulüp sayısı, etkinlik sayısı, toplam katılım, kulüp bazında özet tablo.

### `application-decision-minutes` — kulüp başvuru karar tutanağı

```jsonc
{ "applicationId": "uuid" }
```

`applicationId` zorunlu. Tenant dışı veya olmayan başvuru → `404`. İçerik: başvuru bilgileri, onay zinciri kademeleri (kim, ne zaman, karar, not), imza blokları.

### `general-meeting-minutes` — genel kurul toplantı tutanağı (Form 6)

```jsonc
{ "meetingId": "uuid" }
```

`meetingId` zorunlu. Tenant dışı veya olmayan kayıt → `404`. İçerik: kurum başlığı, topluluk adı, akademik danışman, toplantı tarihi/saati/yeri, tür (olağan/olağanüstü), alınan kararlar, yönetim ve denetleme kurulu (asil/yedek, unvanlarla), imza blokları (danışman «Uygundur»). Gövdede üretim tarihi yok; aynı `meetingId` → aynı SHA-256.

## Sınırlar

- Üst satır sınırı: **50.000** — aşılırsa `400` + `exports.rowLimitExceeded`.
- Cache yok; her istek canlı sorgu + üretim.
- Asenkron/kuyruk yok.

## Deterministik çıktı

Aynı parametrelerle üretilen dosyalar bayt bayt aynı olmalı: sabit xlsx/PDF meta damgası, deterministik `ORDER BY` (+ `id` tie-break), belge gövdesinde üretim tarihi yok (yalnızca istenen dönem/parametre özeti).

Başlık bloğu: üniversite adı, rapor başlığı, parametre özeti. Tenant `primaryColor` (varsa) başlık vurgusu için kullanılır.

## Örnek — katalog

```jsonc
{
  "success": true,
  "message": "Rapor kataloğu listelendi.",
  "data": [
    {
      "id": "clubs",
      "format": "xlsx",
      "labelTr": "Kulüp listesi",
      "labelEn": "Club list",
      "parameters": [ ... ]
    },
    {
      "id": "annual-activity-report",
      "format": "pdf",
      "labelTr": "Yıllık faaliyet raporu",
      "labelEn": "Annual activity report",
      "parameters": [
        { "name": "year", "type": "integer", "required": true, "labelTr": "Yıl", "labelEn": "Year" }
      ]
    }
  ]
}
```
