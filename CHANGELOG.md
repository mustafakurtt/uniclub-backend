# Changelog

Bu proje [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler;
sürüm numaraları [Semantic Versioning](https://semver.org/) ile uyumludur.

## [Unreleased]

### Added

- **Platform (SaaS operatör) katmanı:** tenant listesi/istatistik, `universities.status` yaşam döngüsü, atomik tenant onboard, platform hesapları (`/api/platform`).
- **Tenant yönetici daveti:** token'lı kabul akışı — operatör tenant admin şifresini bilmez (`POST /api/platform/tenants/:id/invite-admin`, `POST /api/auth/accept-tenant-admin-invitation`).
- **Oturum iptali (`tokenVersion`)** ve self-servis şifre sıfırlama (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`).
- **Duyuru yaşam döngüsü** (draft/published, pinned, visibility) ve **okul geneli duyuru** (`/api/universities/:universityId/announcements`).
- **Bildirim tercihleri** (tip/kulüp bazlı susturma), toplu fan-out ve kuyruk eşiği (500+ alıcı).
- **`tenant_settings`:** tenant başına yapılandırılabilir kurallar (sabitleme kotası, okul geneli duyuru hızı, kulüp başvuru onay zinciri) — `GET/PATCH /api/universities/:universityId/settings`.
- **Çok kademeli kulüp başvuru onay zinciri (T4.2):** tenant ayarı `club.application.approval_chain`; özet durum adımlardan türetilir; bildirim yalnızca nihai kararda.
- **Başvuru revizyon akışı (T4.1):** revizyon talebi (`revision_requested`), öğrenci yeniden gönderim (aynı kayıt), append-only olay geçmişi, `club.application.revision_requested` bildirimi.
- **Kuruluş dijital destek toplama (T1.1):** tenant eşik ayarı (`club.formation.support_threshold`, 0=kapalı), öneri → destek → otomatik onay zinciri, `club.formation.threshold_reached` bildirimi.
- **Tenant profili (C2):** `timezone`, `defaultLocale`, `logoUrl`, `primaryColor` — `PATCH /api/universities/:universityId`.
- **Zamanlanmış yayın (T2.1):** duyuru ve etkinlik için `scheduledPublishAtLocal` (tenant yerel saat → UTC); BullMQ gecikmeli iş; iptal/değiştirme; geçmiş reddi.
- **Zamanlanmış yayın mutabakatı:** açılış + 3 dk periyodik Postgres→BullMQ tarama; Redis iş kaybında yeniden kuyruk / gecikmiş yayın.
- **Kamuya açık okuma (T10.3/T10.5):** `/api/public/universities/:slug/clubs/:clubSlug` ve `.../activities/:id`; public DTO; IP hız sınırı.
- **QR kod sistemi (T10.1):** afiş QR (`poster_qr_codes`, kamuya açık çözümleme, kaynak etiketi, tarama sayacı) + dönen yoklama QR (Redis token, self check-in).
- **QR tarama analitiği (T6.2 dilimi):** kod/hedef bazlı özet uçları, tenant timezone ile gün/saat gruplama.
- **Locale cache:** kullanıcı tercihi ve tenant `defaultLocale` ayrı cache anahtarları (`i18n:locale`, TTL 600s); profil/tenant güncellemesinde invalidate.
- **Core:** taşınabilir hız sınırı fabrikası (`core/ratelimit`), sağlık/hazırlık mekanizması geliştirmeleri.
- **Operasyon:** açılışta migration açığı kontrolü.

### Changed

- **Şifre minimum uzunluğu:** self-service kayıt/giriş **8** karakter; operatör provision (tenant admin davet, platform hesap) **12** karakter.
- **`POST /api/platform/tenants/:id/invite-admin`** artık şifre almaz — yalnızca davet e-postası gönderir.
- **`GET /api/platform/tenants`** yanıtı `{ items, nextCursor }` sayfalama zarfına geçti (düz dizi değil).
- Etkinlik şeması: FK `onDelete` politikaları; kulüp silme varsayımı hizalaması (`announcements` → clubs RESTRICT).
- Tenant `status` cache ayrı anahtara taşındı (`rbac:tenant-status`).
- API mesaj dili: kullanıcı tercihi → `Accept-Language` → tenant `defaultLocale` → `tr`; mail/kuyruk bağlamında başlık yok.

### Fixed

- Login timing enumeration (sabit süre yanıt) ve `JWT_SECRET` placeholder reddi.
- Tenant admin daveti: tek kullanımlık token, askıya alınmış tenant'ta kabul engeli.
- Denetim kaydı (`clientIp` / `app.request` bağlamında) sessizce düşme sorunu.
- Feed cursor ve bildirim fan-out toplu yazım tutarlılığı.

### Security

- Login yanıt süresi eşitlemesi (enumeration azaltma).
- `JWT_SECRET` için minimum uzunluk ve örnek değer reddi.

---

## [1.6.0] — 2026-07-14

### Added

- **Activities** (`/api/activities`): etkinlik yaşam döngüsü, RSVP, co-host (çok üniversiteli dahil), takvim.
- **Moderation** (`/api/moderation`): ban/unban, yönetici şifre sıfırlama, kullanıcı aktivite geçmişi.
- **Media** (`/api/uploads`): dosya yükleme ve `/uploads/:key` üzerinden servis.
- **Dashboard & Feed** (`/api/feed`, kulüp/okul panelleri): role göre özet ve akış.
- Web Push (VAPID) — WebSocket'in tamamlayıcısı, uygulama kapalıyken teslimat.
- Prometheus `/metrics`, graceful shutdown (SIGTERM/SIGINT), Vector→Loki→Grafana log yığını.
- HTTP sertleştirme: CORS allowlist, secure-headers, body-limit.
- Birleşik hata zarfı + i18n (`tr`/`en`): `{ success, message, code?, details?, requestId }`.

### Changed

- RBAC çekirdeği taşınabilirlik refactor'u; effective yetki cache `core/cache` facade'ına taşındı.

### Fixed

- Cache fail-open: Redis hatasında okuma miss / yazma best-effort.
- `/metrics` ve `/health` request logger gürültüsünden hariç.

---

## [1.5.0] — 2026-07-13

### Added

- Taşınabilir cache altyapısı (`core/cache`) ve university pilotu; clubs, announcements, gallery, auth, admin okuma cache'leri.
- `BaseRepository` — repository katmanı ortak CRUD.
- **Moderation** (`/api/moderation`): ban/unban, şifre sıfırlama, aktivite geçmişi.
- Birleşik hata zarfı + i18n (`Accept-Language`, `VALIDATION_ERROR` + `details`).
- Üniversite/fakülte/bölüm/domain soft delete.
- Entegrasyon testleri: auth, RBAC, multi-tenant izolasyon.

### Changed

- Feature'lar core i18n/error handling'e geçirildi (typed `MessageKey`, route'larda `try/catch` yok).
- Admin `PATCH .../users/:userId/status` kaldırıldı → moderation ban/unban.

---

## [1.4.1] — 2026-07-11

### Fixed

- Production migrate imajında env bootstrap eksikliği (`db:migrate` deploy adımı).

---

## [1.4.0] — 2026-07-10

### Added

- Production bootstrap: RBAC katalog provision ve ilk `super_admin` oluşturma.
- Migrate adımı deploy'dan ayrıldı (durum raporu doğruluğu).

---

## [1.3.0] — 2026-07-10

### Added

- Reverse proxy (yerel TLS: `uniclub.test`), path tabanlı `/api` routing, frontend kök yolu.
- Deploy agent loglama ve push-to-production dokümantasyonu.

### Changed

- Yayınlanan portlar varsayılan olarak localhost'a bağlandı.

### Fixed

- Deploy sonrası proxy config reload; admin API erişimi deploy sırasında açık kalır.

---

## [1.2.0] — 2026-07-10

### Added

- Pull-based deploy agent (self-hosted runner yerine).
- Self-contained production stack (dev ortamıyla yan yana).

### Fixed

- Restore script canlı veritabanını overwrite ettiğinde dürüst uyarı.

---

## [1.1.1] — 2026-07-10

### Fixed

- `/health` readiness: Postgres ve Redis probe edilmeden `healthy` raporlanmıyordu.

---

## [1.1.0] — 2026-07-10

### Added

- Deploy pipeline, ortam kapıları ve operasyon runbook.
- CI entegrasyon smoke testi (gerçek Postgres + Redis).
- Veritabanı yedekleme ve restore drill script'leri.

### Changed

- Seed idempotent — tekrar çalıştırılabilir.

### Fixed

- Seed süreci connection pool kapatma (process takılması).

---

## [1.0.0] — 2026-07-10

### Added

- İlk public release: multi-tenant kulüp yönetimi API (`/api/auth`, `/api/clubs`, `/api/universities`, RBAC).
- Kalıcı bildirimler + WebSocket gerçek zamanlı teslimat.
- Append-only denetim izi (`audit_logs`).
- Docker production image ve docker-compose yığını.
- E-posta doğrulama kuyruğu (BullMQ + Mailpit).
