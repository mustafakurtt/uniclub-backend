# Platform orkestrasyon sınırı — tasarım notu

**Durum:** Onaylandı (2026-07-31)  
**İlgili:** [ADR 0008](../adr/0008-platform-feature-boundary.md) · [ADR 0003](../adr/0003-core-shared-portability-boundary.md)

## Problem

`features/platform/` veri sahibi tablolara doğrudan yazıyor. ADR 0008 mount sınırını çözdü; veri sahipliği sınırını bu refactor kapatır.

## Bağlayıcı kural

| Katman | Kural |
|---|---|
| **Yazma** | İstisnasız sahibi feature **servisinden**; platform'da sahibi olmayan tabloya `insert`/`update` yok. |
| **Çapraz-tenant agregasyon / read-model** | Doğrudan sorgu serbest — salt-okunur, iş kuralı yok (`count*ByUniversityIds`). |
| **Tekil iş okuması** | Doğrulama amaçlı okumalar sahibi servisten (`findStaffDomain` → `universityService`). |

## Mekanizma: orkestratör transaction + sahip repository `tx` kabulü

```text
hashPassword(...)                    // tx ÖNCESİ
db.transaction(tx =>
  universityService.createTenantPackage(data, { tx })
  authService.provisionStaffAccount({ tx, passwordHash, ... })
)
await afterCommit()                  // mail, effect.emit, invalidate, notifySafe
```

**Transaction içinde yalnızca DB yazımı.** Şifre hash'i tx öncesi; `provision*` metotları hash'lenmiş şifre alır.

**Yan etki sızıntısını imzayla engelle:** sahip servisler `{ result, afterCommit?: () => Promise<void> }` döner; orkestratör commit sonrası çalıştırır.

**Auth provizyon niyetleri (boolean bayrak yok):**

- `registerSelfService(...)` — öğrenci kaydı, e-posta doğrulama zorunlu.
- `provisionStaffAccount(...)` — operatör açılan tenant admin; `mustChangePassword: true`, politika auth'un kararı.
- `provisionPlatformAccount(...)` — platform hesabı; aynı provizyon politikası.

Platform hesap **türünü** söyler; politika auth'ta.

**Teknik:** `DbExecutor` → `src/db/executor.ts`. Sahip repository `*InTx(tx, …)`; servis nested transaction açmaz.

## Üniversite listeleme (üç endpoint kalır)

| Endpoint | Tüketici | Fark |
|---|---|---|
| `GET /api/universities` | Kayıt / public keşif | Minimal, cache'li, auth yok |
| `GET /api/admin/universities` | Okul paneli tenant seçici | Aktör kapsamı |
| `GET /api/platform/tenants` | SaaS operatörü | Liste + stats agregasyonları |

## statusChangedBy

`PATCH /tenants/:id/status` → route aktör `userId` servise akar → `universities.statusChangedBy` (FK `users.id`, `onDelete: set null`).

## ADR 0003

Tx tipi `src/db`'de; `core/` değişmez.

## Davranış değişiklikleri (kabul edilen)

- Yanıta `statusReason` / `statusChangedAt` / `statusChangedBy` eklenir.
- Şifre min: register/changePassword 8; provision/bootstrap 12.

---

**Uygulama:** Adım 2 refactor + Adım 3 yan işler. Hedef: platform'da sahipsiz insert/update = 0; tx içi yan etki = 0.
