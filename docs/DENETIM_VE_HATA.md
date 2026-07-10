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

## 2. Hata Yönetimi

### Sözleşme

Servisler kullanıcıya gösterilecek iş kuralı hatalarını **düz** `new Error("Türkçe mesaj")`
olarak fırlatır. Altyapı hataları ise her zaman Error'ın alt sınıflarıdır
(pg → `DatabaseError`, drizzle → `DrizzleQueryError`, runtime → `TypeError`).
Ayrım bu farka dayanır: `err.constructor === Error` → iş kuralı hatası.

| Hata türü | İstemciye dönen | Sunucuda |
|---|---|---|
| İş kuralı (`new Error("...")`) | 400/404 + Türkçe mesaj | log yok (normal akış) |
| `HTTPException` | kendi status'u + mesajı | log yok |
| Altyapı / beklenmeyen | **500 + jenerik mesaj + `requestId`** | `console.error` + stack + requestId |

Eskiden `duplicate key value violates unique constraint "..."` ya da
`Failed query: select ...` gibi mesajlar istemciye sızıyordu — artık sızmaz.

### requestId

Her istek `hono/request-id` ile bir korelasyon kimliği alır. Hata yanıtlarında
`requestId` alanı döner; kullanıcı "hata aldım" dediğinde bu kimlikle sunucu
logundaki stack'e ulaşılır.

### Rota catch blokları

Rotalardaki `catch` blokları `error.message`'ı KÖRLEMESİNE dönmez; ortak
yardımcıyı kullanır:

```ts
import { respondWithBusinessError } from "../../shared/utils/error.util";

try {
  ...
} catch (error) {
  return respondWithBusinessError(c, error, statusFromError);
  // iş kuralı hatası → 400/404 + mesaj
  // altyapı hatası  → yeniden fırlatılır → app.onError → 500 + jenerik mesaj
}
```

Yeni rota yazarken de bu deseni kullanın.
