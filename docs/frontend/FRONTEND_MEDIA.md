# Frontend — Dosya Yükleme (Media)

Gerçek dosya yükleme. Mevcut `*Url` alanları (kulüp logo/kapak, kullanıcı fotoğrafı,
galeri görseli) **hâlâ düz URL string'i** taşır — akış şudur: **önce dosyayı yükle →
dönen URL'yi ilgili alana yaz.** Böylece yükleme, mevcut endpoint'leri hiç
değiştirmeden eklendi.

## Akış

```
1. POST /api/uploads   (multipart: file + purpose)   → { url }
2. O url'yi ilgili yere yaz, örn:
   PATCH /api/clubs/:clubId          { "logoUrl": "<url>" }
   PATCH /api/users/me               { "photoUrl": "<url>" }
   POST  /api/clubs/:clubId/gallery  { "imageUrl": "<url>", "caption": "..." }
```

## Endpoint'ler

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/api/uploads` | Bearer | Dosya yükle (multipart/form-data) |
| DELETE | `/api/uploads/:mediaId` | Bearer | Dosyayı sil (**yalnızca yükleyen**) |
| GET | `/uploads/:key` | **Public** | Dosyayı servis et (`/api` altında DEĞİL) |

### POST /api/uploads (multipart/form-data)

| Alan | Zorunlu | Değer |
|---|---|---|
| `file` | ✅ | Yüklenecek dosya |
| `purpose` | — | `avatar` \| `club_logo` \| `club_cover` \| `gallery` \| `other` (vars. `other`) |

**Kısıtlar (güvenlik):**
- **Yalnızca görsel:** PNG, JPEG, WEBP, GIF. Tip **içerikten (magic byte)** doğrulanır —
  beyan edilen `Content-Type`'a güvenilmez; `.png` uzantılı ama HTML olan dosya **reddedilir** (`400`). SVG **kabul edilmez** (XSS).
- **Boyut:** `MAX_UPLOAD_BYTES` (varsayılan 5 MB) — aşılırsa `413`.
- İstemci dosya adı **kullanılmaz**; sunucu rastgele `<uuid>.<ext>` anahtarı üretir.

**Yanıt (`201`):**
```jsonc
{
  "success": true, "message": "Dosya yüklendi.",
  "data": {
    "id": "1b2adfda-...",                 // silme için
    "url": "/uploads/257a67b4-....png",   // *Url alanına yazılacak
    "contentType": "image/png",
    "sizeBytes": 70,
    "purpose": "club_logo"
  }
}
```

> **URL biçimi:** `UPLOAD_PUBLIC_BASE_URL` ayarlıysa mutlak (`https://cdn.../uploads/<key>`),
> değilse **relatif** `/uploads/<key>` döner — relatifse frontend API tabanına göre çözer.

### GET /uploads/:key
Public servis. `Cache-Control: public, max-age=31536000, immutable` (key değişmez →
tarayıcı sonsuza dek cache'leyebilir). Görsel açık sayfalarda `<img src>` ile gömülebilir.

### Hata kodları
| Durum | HTTP |
|---|---|
| Dosya yok / boş | `400` (`media.noFile` / `media.empty`) |
| Görsel değil (magic-byte) | `400` (`media.unsupportedType`) |
| Geçersiz purpose | `400` |
| Boyut aşımı | `413` (`code: PAYLOAD_TOO_LARGE`) |
| Token yok | `401` |
| Başkasının dosyasını silme | `403` |
| Servis: geçersiz key / yok | `400` / `404` |

## Notlar
- **Silme sahipliği:** yalnızca yükleyen siler (v1). `*Url` alanına yazılan bir dosyayı
  silmek referansı otomatik temizlemez (alan eski URL'yi tutar) — önce alanı güncelle.
- **Depolama:** self-host'ta yerel disk (`UPLOAD_DIR`, yedeklenmeli); ileride S3'e
  geçiş yalnızca env + adaptör değişimidir, API aynı kalır.
