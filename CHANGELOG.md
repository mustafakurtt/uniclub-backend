# Changelog

Bu proje [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler;
sürüm numaraları [Semantic Versioning](https://semver.org/) ile uyumludur.

## [Unreleased]

### Added
- **Moderation** (`/api/moderation`): ban/unban, şifre sıfırlama, aktivite geçmişi
  ([integration/moderation.md](docs/integration/moderation.md)).
- **Media** (`/api/uploads`): dosya yükleme ([integration/media.md](docs/integration/media.md)).
- **Dashboard & Feed** ([integration/dashboard.md](docs/integration/dashboard.md)).
- **Activities** (`/api/activities`) ([integration/activities.md](docs/integration/activities.md)).
- **Birleşik hata zarfı + i18n:** tüm hatalar
  `{ success:false, message, code?, details?, requestId }`; `message`
  `Accept-Language`'e göre (`tr`/`en`). Doğrulama hataları `code: "VALIDATION_ERROR"`
  + `details:[{ path, code, message }]`.
- **Login:** `user.mustChangePassword` alanı — `true` ise zorunlu şifre değiştirme
  ekranı.
- **Yeni bildirim tipleri:** `account.unsuspended`, `account.passwordReset`.

### Changed
- Admin `PATCH .../users/:userId/status` **kaldırıldı** → yerine moderation
  ban/unban (`docs/integration/moderation.md`).

### Frontend notu
Mantığı mesaj metnine değil `code`/HTTP status'a bağlayın. Ayrıntılar:
`docs/reference/error-and-audit.md`, `docs/integration/moderation.md`.
