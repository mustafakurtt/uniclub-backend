# Changelog

Bu proje [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler;
sürüm numaraları [Semantic Versioning](https://semver.org/) ile uyumludur.

## [Unreleased]

### Added
- **Moderation feature** (`/api/moderation`): kullanıcı ban/unban (sebepli), admin
  şifre sıfırlama (geçici şifre), kullanıcı aktivitesi + moderasyon geçmişi.
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
