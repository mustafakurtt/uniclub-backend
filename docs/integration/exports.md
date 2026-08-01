# Kurumsal rapor dışa aktarma (T4.5 v1)

SKS ve okul yöneticisinin kulüp/üye/etkinlik verisini resmî Excel dosyası olarak indirmesi.

**Yetki:** `university.export.generate` (`university_admin`, `student_affairs` demetlerinde). Rotalar `guard(..., { tenantScoped: true })` ile korunur; POST üretimleri `audit_logs`'a düşer.

## Uçlar

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/universities/:universityId/exports` | Rapor kataloğu (`id`, `labelTr`, `labelEn`, `parameters`) |
| POST | `/api/universities/:universityId/exports/:reportId` | Rapor üret → dosya gövdesi |

POST yanıtı dosya akışıdır; `Content-Disposition: attachment; filename="<reportId>-<slug>-<param-özeti>.xlsx"`.

Excel üretimi başarısızsa (Bun uyumsuzluğu) **sessiz CSV'ye düşülmez** — UTF-8 BOM + `;` ayırıcılı CSV döner; `X-Export-Fallback: csv` ve `X-Export-Fallback-Reason` başlıkları eklenir.

## v1 raporları

### `clubs` — kulüp listesi

Body (opsiyonel alanlar):

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

## Sınırlar

- Üst satır sınırı: **50.000** — aşılırsa `400` + `exports.rowLimitExceeded`.
- Cache yok; her istek canlı sorgu + üretim.
- v1'de asenkron/kuyruk yok.

## Deterministik çıktı

Aynı parametrelerle üretilen dosyalar bayt bayt aynı olmalı: sabit xlsx meta damgası, deterministik `ORDER BY` (+ `id` tie-break), başlıkta üretim tarihi yok (yalnızca istenen dönem/parametre özeti).

Başlık bloğu: üniversite adı, rapor başlığı, parametre özeti. Tenant `primaryColor` (varsa) başlık vurgusu için kullanılır; logo gömülmez (v1).

## Örnek — katalog

```jsonc
{
  "success": true,
  "message": "Rapor kataloğu listelendi.",
  "data": [
    {
      "id": "clubs",
      "labelTr": "Kulüp listesi",
      "labelEn": "Club list",
      "parameters": [
        { "name": "status", "type": "enum", "labelTr": "Kulüp durumu", "labelEn": "Club status", "enumValues": ["pending", "approved", "rejected", "archived"] }
      ]
    }
  ]
}
```
