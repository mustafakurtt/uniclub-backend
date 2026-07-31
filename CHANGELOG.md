# Changelog

Bu proje [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler;
sürüm numaraları [Semantic Versioning](https://semver.org/) ile uyumludur.

## [Unreleased]

### Added
- **Moderation feature** (`/api/moderation`): kullanıcı ban/unban (sebepli), admin
  şifre sıfırlama (geçici şifre), kullanıcı aktivitesi + moderasyon geçmişi.
- **Yeni feature — Media (`/api/uploads`):** gerçek dosya yükleme (görsel; magic-byte doğrulaması, ≤5MB). Akış: yükle → dönen URL'yi mevcut `*Url` alanına yaz (endpoint'ler hâlâ URL string alır). Public servis `/uploads/:key`. Depolama env ile değişir (yerel disk / S3). (bkz. `frontend/FRONTEND_MEDIA.md`)
- **Yeni feature — Dashboard & Feed:** rollere göre özet/akış (okuma modeli). Öğrenci akışı `GET /api/feed` (kulüplerimin duyuru+etkinlikleri, keyset), öğrenci özeti `GET /api/users/me/dashboard`, kulüp paneli `GET /api/clubs/:clubId/dashboard` (staff), admin paneli `GET /api/admin/universities/:uid/dashboard` (`user.view`). (bkz. `frontend/FRONTEND_DASHBOARD.md`)
- **Yeni feature — Activities (`/api/activities`):** kulüp etkinlikleri — keşif, katılım (RSVP), takvim (`/api/users/me/activities`) ve kulüp-içi yönetim (`/api/clubs/:clubId/activities`). Etkinlik↔kulüp **M:N** (host/co_host) → aynı üniversite co-hosting **ve** üniversitelerarası turnuva desteklenir. Yeni bildirim tipleri: `activity.published`, `activity.cancelled`. (bkz. `frontend/FRONTEND_ACTIVITIES.md`)
- **Yeni feature — Moderation (`/api/moderation`):** kullanıcı ban/unban (sebepli), admin şifre sıfırlama (geçici şifre), kullanıcı aktivitesi + moderasyon geçmişi. (bkz. `frontend/FRONTEND_MODERASYON.md`)
- **Birleşik hata zarfı + i18n:** tüm hatalar
  `{ success:false, message, code?, details?, requestId }`; `message`
  `Accept-Language`'e göre (`tr`/`en`). Doğrulama hataları `code: "VALIDATION_ERROR"`
  + `details:[{ path, code, message }]`.
- **Login:** `user.mustChangePassword` alanı — `true` ise zorunlu şifre değiştirme
  ekranı.
- **Yeni bildirim tipleri:** `account.unsuspended`, `account.passwordReset`.

### Changed
- Admin `PATCH .../users/:userId/status` **kaldırıldı** → yerine moderation
  ban/unban (`docs/frontend/FRONTEND_MODERASYON.md`).

### Frontend notu
Mantığı mesaj metnine değil `code`/HTTP status'a bağlayın. Ayrıntılar:
`docs/DENETIM_VE_HATA.md`, `docs/frontend/FRONTEND_MODERASYON.md`.
