# Denetim İzi (Audit Log) ve Hata Yönetimi

## 1. Denetim İzi

### Ne kaydedilir?

`guard()` ile korunan **her yazma isteği** (POST/PATCH/PUT/DELETE) otomatik olarak
`audit_logs` tablosuna düşer. Elle hiçbir servis çağrısı gerekmez — yeni bir
guarded rota eklediğinizde denetim izi kendiliğinden çalışır.

Kaydedilen alanlar:

| Alan | İçerik |
|---|---|
| `actorId` | İşlemi yapan kullanıcı (JWT'den) + listede ad/soyad/e-posta join'lenir |
| `action` | Rotanın yetki anahtarı: `user.manage`, `club.approve`, `university.faculty.update`... |
| `method` / `path` / `status` | HTTP fiili, tam path ve **yanıt kodu** — 403 de kaydedilir: reddedilmiş yetkili-işlem DENEMESİ de denetim izidir |
| `targetType` / `targetId` | Path parametrelerinden türetilen hedef kaynak (`user`, `club`, `club_application`...) |
| `metadata` | `{ params, body }` — body'deki hassas alanlar (`password`, `token`...) `[GİZLENDİ]` olarak maskelenir |
| `ip` | `TRUST_PROXY` ayarına göre gerçek istemci IP'si |
| `universityId` | Kapsam: path'teki tenant → yoksa aktörün tenant'ı → yoksa `null` (platform işlemi) |

Tablo **append-only**: güncelleme/silme endpoint'i bilinçli olarak yoktur,
`updatedAt` kolonu bile yoktur.

### Kimler görebilir?

`audit.view` yetkisi: `auditor`, `university_admin`, `platform_support`, `super_admin`.

```
GET /api/audit/universities/:universityId
    ?limit=50            (1-100)
    &cursor=<ISO tarih>  (keyset sayfalama — bildirimlerle aynı desen)
    &actorId=<uuid>      ("bu kişi neler yaptı?")
    &action=user.manage  ("kim kullanıcı yönetti?")
    &targetId=<id>       ("bu kayda kimler dokundu?")
```

### Mimari

```
guard(key) = [authMiddleware, attachAuthz, auditTrail(key), requirePermission(key), enforceTenantScope?]
                                   │
                                   │ (yalnızca yazma metodları, yanıt tamamlandıktan sonra)
                                   ▼
                 core/rbac/audit-hook.ts  ←── setGuardAuditSink() ── features/audit/audit.sink.ts
                 (taşınabilir mekanizma)        (index.ts açılışta)     (projeye özgü: alan türetme,
                                                                         maskeleme, DB'ye yazma)
```

- `core/` proje-bağımsız kalır: sink kayıtlı değilse kanca no-op'tur.
- Sink hatası isteği asla düşürmez (`notifySafe` ile aynı ilke).
- Askıya alınmış kullanıcı `attachAuthz`'da kesildiği için (auditTrail'den önce)
  denetim izine düşmez; yetkisi olmayan kullanıcının denemesi (403) düşer.
- **Kapsam dışı:** kulüp-içi yönetim (`club.middleware` — başkanın üye atması vb.)
  `guard()`'dan geçmediği için otomatik denetlenmez. Gerekirse servislerden
  `auditService.record(...)` elle çağrılabilir.

### Mevcut veritabanına kurulum

```sh
bun run db:migrate            # audit_logs tablosu
bun run db:sync-permissions   # audit.view yetkisi + rol atamaları (veri sıfırlamadan)
```

## 2. Hata Yönetimi (frontend sözleşmesi)

Tüm hatalar **tek bir merkezi yakalayıcıdan** (`app.onError`) geçer ve **tek tip
zarfla** döner. Frontend hiçbir zaman ham SQL/stack görmez.

### Hata zarfı

```jsonc
{
  "success": false,
  "message": "Kullanıcı bulunamadı.",   // isteğin diline çevrilmiş, kullanıcıya gösterilebilir
  "code": "VALIDATION_ERROR",           // OPSİYONEL, makine-okur (varsa string eşleştirme YERİNE bunu kullanın)
  "details": [ /* OPSİYONEL, alan-bazlı doğrulama hataları */ ],
  "requestId": "174a9256-..."           // her yanıtta; destek/log korelasyonu için
}
```

Başarı zarfı ise simetriktir: `{ "success": true, "message": "...", "data": ... }`.

### Hata türleri ve status kodları

| Durum | HTTP | Zarf |
|---|---|---|
| İş kuralı (bulunamadı) | **404** | `message` |
| İş kuralı (geçersiz işlem) | **400** | `message` |
| Doğrulama (girdi) | **400** | `message` + `code: "VALIDATION_ERROR"` + `details[]` |
| Kimlik yok/geçersiz token | **401** | `message` |
| Yetki yok / tenant dışı / askılı hesap | **403** | `message` |
| Altyapı / beklenmeyen | **500** | jenerik `message` (SQL/stack **sızmaz**) + `requestId` (sunucuda loglanır) |

### Doğrulama hataları (`details`)

Girdi doğrulaması başarısızsa artık ham `ZodError` DÖNMEZ; birleşik zarf döner:

```jsonc
{
  "success": false,
  "message": "Girdi doğrulaması başarısız.",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "email", "code": "invalid_format", "message": "..." },
    { "path": "domains.0.domain", "code": "too_small", "message": "..." }
  ],
  "requestId": "..."
}
```

Frontend `details[].path` ile ilgili form alanının altına hata yazabilir;
`code` diller arası sabittir (`too_small`, `invalid_type`, `too_big`,
`invalid_format`, `invalid_value`, `unrecognized_keys`).

### Machine-readable `code` (string eşleştirmeyin!)

Bazı hatalar makine-okur bir `code` taşır — mesaj metnine göre değil, buna göre
dallanın (mesajlar dile göre değişir):

| `code` | Anlamı |
|---|---|
| `VALIDATION_ERROR` | Girdi doğrulaması (bkz. `details`) |
| `EMAIL_NOT_VERIFIED` | E-posta doğrulanmadan yazma denendi |
| `RATE_LIMITED` | Hız sınırı aşıldı (`Retry-After` başlığına bakın) |

### Çok dillilik (i18n) — `Accept-Language`

Hem hata hem başarı mesajları isteğin diline göre döner. İstemci
`Accept-Language` başlığı gönderir; desteklenen diller **`tr` (varsayılan)** ve
**`en`**. Desteklenmeyen dil varsayılana (`tr`) düşer.

```
GET /api/universities/<yok>                       → "Üniversite bulunamadı."
GET /api/universities/<yok>   Accept-Language: en → "University not found."
```

> `message` kullanıcıya gösterilebilir ama **dile bağlıdır**; kalıcı mantık için
> `code`/`details`/HTTP status kullanın.

### requestId

Her istek bir korelasyon kimliği alır ve **her** hata yanıtında `requestId`
döner. Kullanıcı "hata aldım" dediğinde bu kimlikle sunucu logundaki stack'e
ulaşılır. Destek akışında bu kimliği kullanıcıdan isteyin.
