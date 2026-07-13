# Frontend — Kullanıcı Yönetimi / Moderasyon (`/api/moderation`)

Yönetim panelinin **kullanıcı odaklı** yüzeyi: bir kullanıcıyı askıya alma (ban),
askıyı kaldırma (unban), şifresini sıfırlama, ne yaptığını görme (denetim
aktivitesi) ve üzerinde uygulanmış moderasyon işlemlerinin geçmişi.

> Genel zarf/hata/i18n kuralları için `docs/API.md → Genel Kurallar` ve
> `docs/DENETIM_VE_HATA.md`. Bu doküman yalnızca moderation endpoint'lerini anlatır.

## Yetki ve kapsam

- **Yetkiler:** yazma işlemleri (ban/unban/reset) `user.manage`; okuma
  (activity/history) `user.view`. Bu yetkiler seed'de `university_admin`,
  `student_affairs`, `platform_support`, `super_admin` gibi rollerde bulunur
  (salt-okuma için `auditor` da `user.view` taşır).
- **Tenant-scoped:** tüm rotalar `:universityId` taşır ve çağıranın kendi
  üniversitesiyle eşleşmelidir. `super_admin` / `platform_support` bu kontrolü
  bypass eder (herhangi bir üniversiteyi hedefleyebilir). Aksi halde **403**.
- Hedef kullanıcı o üniversiteye ait değilse **404** (`moderation.userNotFound`).

Tüm path'ler `/api/moderation/universities/:universityId/users/:userId/...`
biçimindedir ve `Authorization: Bearer <token>` gerektirir.

## 1. Ban (askıya alma) — sebep zorunlu

```
POST /api/moderation/universities/:universityId/users/:userId/ban
Body: { "reason": "string (3-500)" }
```

```jsonc
// 200
{ "success": true, "message": "Kullanıcı askıya alındı.",
  "data": { "id": "...", "status": "suspended", "...": "passwordHash hariç kullanıcı" } }
```

- Askı **anında** etkilidir: askılı kullanıcının bir sonraki isteği 403 alır, girişi
  401 ile reddedilir. Kullanıcıya bir bildirim (`account.suspended`) düşer.
- Hatalar: `400 moderation.cannotModerateSelf` (kendini banlayamazsın),
  `400 moderation.alreadyBanned` (zaten askıda), `404 moderation.userNotFound`.

## 2. Unban (askıyı kaldırma)

```
POST /api/moderation/universities/:universityId/users/:userId/unban   (body yok)
```

```jsonc
// 200
{ "success": true, "message": "Kullanıcının askısı kaldırıldı.",
  "data": { "id": "...", "status": "active", "..." : "..." } }
```

- Hata: `400 moderation.notBanned` (kullanıcı askıda değil). Bildirim: `account.unsuspended`.

## 3. Şifre sıfırlama — geçici şifre BİR KEZ döner

```
POST /api/moderation/universities/:universityId/users/:userId/reset-password   (body yok)
```

```jsonc
// 200
{ "success": true, "message": "Kullanıcının şifresi sıfırlandı.",
  "data": { "temporaryPassword": "Aa3!x9..." } }
```

- ⚠️ `temporaryPassword` **yalnızca bu yanıtta** döner, tekrar alınamaz. Yöneticiye
  gösterip güvenli bir kanaldan kullanıcıya iletmesini sağlayın (ekranda "kopyala").
- Kullanıcı bu geçici şifreyle giriş yapabilir; **login yanıtında
  `user.mustChangePassword: true`** gelir. Frontend bu durumda kullanıcıyı zorunlu
  **şifre değiştirme** ekranına yönlendirmeli. Kullanıcı `PATCH /api/users/me/password`
  ile yeni şifresini belirleyince bayrak otomatik `false` olur.
- Kullanıcıya `account.passwordReset` bildirimi düşer.

## 4. Kullanıcı aktivitesi (ne yaptı?) — denetim izi

```
GET /api/moderation/universities/:universityId/users/:userId/activity
    ?limit=20            (1-100, varsayılan 20)
    &cursor=<ISO tarih>  (keyset sayfalama)
```

Mevcut denetim (audit) altyapısını, `actorId = :userId` filtresiyle yeniden
kullanır — yani "bu kullanıcı hangi yönetsel işlemleri yaptı".

```jsonc
// 200
{ "success": true, "message": "Kullanıcı aktivitesi listelendi.",
  "data": {
    "items": [
      { "id": "...", "action": "club.approve", "method": "PATCH", "path": "/api/admin/...",
        "status": 200, "targetType": "club", "targetId": "...", "createdAt": "...",
        "actor": { "id": "...", "firstName": "...", "lastName": "...", "email": "..." } }
    ],
    "nextCursor": "2026-07-10T12:00:00.000Z"   // sonraki sayfa yoksa null
  } }
```

Sayfalama: yanıttaki `nextCursor`'ı bir sonraki isteğe `&cursor=` olarak geçin;
`null` gelene kadar devam edin.

## 5. Moderasyon geçmişi (bu kullanıcıya ne yapıldı?)

```
GET /api/moderation/universities/:universityId/users/:userId/moderation-history
    ?limit=20&cursor=<ISO tarih>
```

```jsonc
// 200
{ "success": true, "message": "Moderasyon geçmişi listelendi.",
  "data": {
    "items": [
      { "id": "...", "action": "ban", "reason": "Kurallara aykırı davranış",
        "previousStatus": "active", "newStatus": "suspended", "createdAt": "...",
        "actor": { "id": "...", "firstName": "...", "lastName": "...", "email": "..." } }
    ],
    "nextCursor": null
  } }
```

- `action`: `ban` | `unban` | `password_reset` (yeni tipler eklenebilir).
- `reason` yalnızca `ban`'da doludur; `unban`/`password_reset`'te `null`.
- `actor` = işlemi yapan yönetici (silinmiş olsa bile `null` olarak gelir, kayıt düşmez).

## Önerilen UI akışı

1. Kullanıcı detay ekranı: durum rozeti (`active`/`suspended`/`pending`) + "Askıya al" /
   "Askıyı kaldır" / "Şifre sıfırla" aksiyonları (yalnızca `user.manage` varsa).
2. "Askıya al" → sebep girişi zorunlu (min 3 karakter) → `POST .../ban`.
3. "Şifre sıfırla" → onay → dönen `temporaryPassword`'ü kopyalanabilir şekilde göster.
4. Aynı ekranda iki sekme: **Aktivite** (`.../activity`) ve **Moderasyon geçmişi**
   (`.../moderation-history`), ikisi de "daha fazla yükle" (cursor) ile.
5. `user.view` var ama `user.manage` yoksa: yalnızca okuma sekmeleri gösterilir.
