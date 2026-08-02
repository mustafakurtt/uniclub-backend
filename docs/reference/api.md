# University Club Backend — Frontend API Dokümanı

Bu doküman, frontend ekibinin backend'i entegre ederken ihtiyaç duyacağı tüm bilgileri içerir: base URL, auth akışı, yetki (RBAC) modeli ve her endpoint'in request/response şekli.

> **İlişkili dokümanlar:**
> - `docs/integration/auth.md` — Auth + RBAC yapılanmasının ayrıntılı anlatımı ve ilk 3 feature'ın (Auth, Users, University) request/response örnekli tam referansı. **Auth/RBAC detayı için asıl kaynak orasıdır**; bu doküman tüm endpoint'lerin özet kataloğudur.
> - `docs/integration/university.md` — **University katmanının tam derinlemesine referansı**: granüler `university.*` yetki modeli, üniversite/domain/fakülte/bölüm CRUD'unun request/response örnekleri, silme sırası ve yönetim paneli akışları.
> - `docs/integration/clubs.md` — **Clubs katmanının tam derinlemesine referansı**: kulüp keşfi/üyeliği, kulüp-içi roller (member/officer/başkan), danışman (advisor) akışı, kulüp kurma başvuruları, granüler `club.*` yetki modeli ve admin kulüp yönetimi + uçtan uca senaryolar.
> - `docs/integration/auth-guards.md` — React tarafında route/UI guard mimarisi önerisi.
>
> Not: `message` alanları **isteğin diline** göre döner (`Accept-Language: tr|en`, varsayılan `tr`). Kalıcı mantık için mesaj metnine değil `code`/`details`/HTTP status'a bakın — bkz. [Genel Kurallar → Hata & i18n](#hata-zarf%C4%B1-ve-i18n).

## İçindekiler

- [Genel Kurallar](#genel-kurallar)
- [Kimlik Doğrulama (Auth)](#kimlik-doğrulama-auth)
- [Yetkilendirme Modeli (RBAC)](#yetkilendirme-modeli-rbac)
- [Endpoint Referansı](#endpoint-referansı)
  - [Yüzey kapsaması (frontend eşlemesi)](./api-surface-coverage.md)
  - [Auth](#1-auth--apiauth)
  - [Users (self-service)](#2-users--apiusers)
  - [University](#3-university--apiuniversities)
  - [Clubs](#4-clubs--apiclubs)
  - [Announcements (kulüp alt-kaynağı)](#5-announcements--apiclubsclubidannouncements)
  - [Gallery (kulüp alt-kaynağı)](#6-gallery--apiclubsclubidgallery)
  - [Admin (okul yöneticisi)](#7-admin--apiadmin)
  - [Platform (SaaS operatörü)](#8-platform--apiplatform)
  - [Moderation (kullanıcı yönetimi)](#9-moderation--apimoderation)
  - [Notifications (bildirimler)](#10-notifications--apinotifications)
  - [Audit (denetim izi)](#11-audit--apiaudit)
  - [Activities (etkinlikler)](#12-activities--apiactivities)
  - [Dashboard & Feed](#13-dashboard--feed--apifeed)
  - [Media (dosya yükleme)](#14-media--apiuploads)
  - [Public (kamuya açık okuma)](#15-public--apipublic)
  - [Discover (üniversiteler arası keşif)](#16-discover--apidiscover)
- [Enum Referansı](#enum-referansı)
- [Bilinmesi Gereken Diğer Detaylar](#bilinmesi-gereken-diğer-detaylar)

---

## Genel Kurallar

**Base URL:** `http://localhost:3000` (dev). Tüm feature route'ları `/api` altında mount edilir. Mount edilen route grupları: `/api/auth`, `/api/admin`, `/api/platform`, `/api/public`, `/api/discover`, `/api/universities`, `/api/users`, `/api/clubs`, `/api/activities`, `/api/feed`, `/api/uploads`, `/api/notifications`, `/api/audit`, `/api/moderation`. Ayrıca yüklenen dosyalar **`/uploads/:key`** (public, `/api` altında değil) altından servis edilir. (**`/api/super-admin` diye bir route grubu yoktur** — sistem yönetimi endpoint'leri `/api/auth`, `/api/platform`, `/api/universities` ve `/api/moderation` altındadır.)

**Başarı zarfı** — her başarılı endpoint aynı şekli döner:

```json
{ "success": true, "message": "...", "data": { } }
```

- `POST` ile yeni kayıt oluşturan endpoint'ler `201 Created` döner.
- `/api/auth/login` response'u zarfın dışında ayrıca `user` ve `token` alanlarını da köke koyar — bu tek istisnadır.
- Şifre alanı (`passwordHash`) döndürülen hiçbir kullanıcı objesinde yer almaz (kulüp detayındaki üye/danışman objeleri dahil).

### Hata zarfı ve i18n

Tüm hatalar tek tip zarfla döner (ham SQL/stack **asla** sızmaz):

```jsonc
{
  "success": false,
  "message": "Kullanıcı bulunamadı.",   // isteğin diline çevrilir (Accept-Language)
  "code": "VALIDATION_ERROR",           // OPSİYONEL — makine-okur; string eşleştirme yerine BUNU kullanın
  "details": [ /* OPSİYONEL — alan-bazlı doğrulama hataları */ ],
  "requestId": "174a9256-..."           // her hata yanıtında; destek/log korelasyonu
}
```

| Durum | HTTP | Ek |
|---|---|---|
| Bulunamadı | `404` | — |
| Geçersiz iş kuralı | `400` | — |
| Girdi doğrulama | `400` | `code: "VALIDATION_ERROR"` + `details[]` |
| Token yok/geçersiz | `401` | — |
| Yetki yok / tenant dışı / askılı hesap | `403` | — |
| İstek gövdesi çok büyük | `413` | `code: "PAYLOAD_TOO_LARGE"` (gövde `MAX_BODY_BYTES`'ı aştı) |
| Beklenmeyen | `500` | jenerik mesaj + `requestId` |

- **i18n:** `Accept-Language: tr|en` (varsayılan `tr`). Hem hata hem başarı mesajları çevrilir.
- **Doğrulama** hatasında ham `ZodError` DÖNMEZ; `details[]` = `[{ path, code, message }]`.
- **`code`** taşıyanlar: `VALIDATION_ERROR`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`. Mantığı mesaj metnine değil bu koda/HTTP status'a bağlayın.
- Ayrıntı: `docs/reference/error-and-audit.md`.

**Health check:** `GET /health` → `{ status, environment, checks, timestamp }` (auth gerektirmez).

---

## Kimlik Doğrulama (Auth)

- JWT tabanlı, `Authorization: Bearer <token>` header'ı ile gönderilir.
- Token payload'ı: `{ userId, universityId, exp }` — **7 gün** geçerlidir. Refresh token mekanizması yoktur.
- Login ile tenant (üniversite) seçilmez; **kayıt sırasında e-posta domaini** üzerinden hangi üniversiteye ait olduğu otomatik belirlenir (`user@std.antalya.edu.tr` → domain tablosunda arama). Domain sistemde kayıtlı değilse kayıt reddedilir.
- E-posta domain tipi (`student` / `staff`) kayıt sırasında otomatik rol atar: `staff` domaini → `advisor` rolü, `student` domaini → `student` rolü.
- Kayıt sonrası kullanıcı `status: "pending"` olur; doğrulama linkine tıklanınca (`GET /api/auth/verify?token=...`) `active` olur. **Not:** şu an `pending` kullanıcılar da login olabiliyor (backend'de bilinçli olarak henüz engellenmemiş). `suspended` kullanıcılar login'de reddedilir.
- Email gönderimi şu an gerçek değil — link konsola loglanıyor (BullMQ worker, `auth.queue.ts`). Dev ortamında doğrulama linkini backend konsolundan almanız gerekir.

### Login response örneği

```json
{
  "success": true,
  "message": "Giriş başarılı.",
  "user": { "id": "...", "email": "...", "firstName": "...", "universityId": "...", "status": "active", "mustChangePassword": false, "...": "passwordHash HARİÇ tüm user kolonları" },
  "token": "eyJhbGciOi..."
}
```

Frontend, token'ı saklayıp sonraki tüm isteklerde `Authorization: Bearer <token>` olarak göndermeli. Login response'undaki `user` objesi **rol içermez** — roller için login sonrası `GET /api/users/me` çağrılmalıdır.

> **`mustChangePassword`**: Bir yönetici kullanıcının şifresini sıfırladıysa (moderation) bu alan `true` döner. Frontend bu durumda kullanıcıyı **şifre değiştirme ekranına** yönlendirmelidir; kullanıcı `PATCH /api/users/me/password` ile yeni şifresini belirleyince bayrak otomatik `false` olur.

---

## Yetkilendirme Modeli (RBAC)

Sistemde **iki bağımsız yetki katmanı** vardır — birbirine karıştırılmamalı:

### 1) Global (üniversite geneli) claim-based roller/izinler

- `roles` (seed: 9 kurumsal rol — `super_admin`, `platform_support`, `university_admin`, `student_affairs`, `academic_affairs`, `content_moderator`, `auditor`, `advisor`, `student`) ve `permissions` (seed: `user.view`, `user.manage`, `audit.view`, granüler `club.*`, `announcement.moderate`, `gallery.moderate`, `role.manage`, `permission.manage` + granüler `university.*` — bkz. University/Clubs bölümleri) tabloları.
- Bir kullanıcı birden fazla role sahip olabilir (`userRoles`); roller izin taşır (`rolePermissions`).
- `userPermissions` ile kullanıcıya doğrudan izin verilebilir/geri alınabilir (`granted: false` → rolden gelen izni override edip iptal eder).
- Bu katman **Redis'te 5 dakika cache'lenir** (`rbac.cache.ts`, key: `rbac:permissions:<userId>`). Rol/izin değiştiren tüm endpoint'ler (promote/demote, role permission ekleme/çıkarma) etkilenen kullanıcıların cache'ini **anında temizler** — yani değişiklikler bir sonraki istekte geçerlidir; 5 dakikalık gecikme yoktur. (Ancak hedef kullanıcının açık frontend oturumundaki state kendiliğinden yenilenmez — sayfa yenileme/yeniden login gerekir.)
- Bu katman `admin` feature'ının tüm endpoint'lerinde, `auth` feature'ının yönetim rotalarında ve `universities`'in yazma rotalarında kullanılır (`guard()` → `authMiddleware → attachAuthz → requirePermission("...") [→ enforceTenantScope()]`).
- `super_admin` ve `platform_support` rolleri `enforceTenantScope` kontrolünü bypass eder — yani `:universityId` path param'ı kendi üniversitesiyle eşleşmese bile işlem yapabilirler. Diğer roller için `:universityId` mutlaka kendi `universityId`'leri ile eşleşmelidir, aksi halde `403`.

### 2) Kulüp bazlı roller (`clubMembers.role`)

- Sadece `member` / `officer` / `president` değerlerini alır, global roller sisteminden **tamamen bağımsızdır**.
- `clubs` ve alt-kaynaklarında (`announcements`, `gallery`, üyelik yönetimi) kullanılır: `requireClubStaff` (danışman veya officer/president), `requireClubOfficer` (officer veya president), `requireClubPresident` (sadece president).
- Bu middleware'ler, kullanıcının o kulüpte **`status: "approved"`** bir üyeliği (veya `clubAdvisors` danışmanlığı) olup olmadığını kontrol eder — pending/rejected üyelikler yetki vermez.
- **Danışman** özel bir durumdur: kulüp-içi rolü (`clubMembers`) yoktur ama `requireClubStaff` onu da "staff" sayar (duyuru/galeri girme + istek/üye görüntüleme). Karar mercii işleri (onay/çıkarma/rol/devir) danışmana kapalıdır.

### Frontend için pratik anlamı

- Global **rol adları** `GET /api/users/me` response'undaki `data.roles[]` dizisinden okunur (her eleman rol satırıdır, `name` alanı vardır).
- Global **etkin permission listesi** `GET /api/users/me/permissions` → `{ roles, permissions, status, maxRank }` (override'lar uygulanmış). UI göster/gizle: `permissions.includes("<key>")` — bkz. [auth-guards.md](../integration/auth-guards.md).
- Kulüp bazlı rol, `GET /api/users/me/clubs` (`role`, `status` alanları) veya `GET /api/clubs/:clubId` response'undaki `clubMembers[].role`'den öğrenilir.

---

## Endpoint Referansı

> **Yüzey kapsaması:** Her uca hangi frontend ekranının çağırdığını gösteren ölçüm tablosu
> [api-surface-coverage.md](./api-surface-coverage.md) dosyasında. Yeni uç eklerken bu tabloyu
> da güncelleyin — `docs:check` boş yüzey satırını reddeder.

### 1) Auth — `/api/auth`

Ayrıntılı request/response örnekleri için [auth.md](../integration/auth.md) §4'e bakın.

**Public / self rotaları:**

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/api/auth/register` | Yok | Kayıt olma |
| POST | `/api/auth/login` | Yok | Giriş, JWT döner |
| GET | `/api/auth/verify?token=...` | Yok | E-posta doğrulama linki |
| POST | `/api/auth/accept-tenant-admin-invitation` | Yok | Tenant yönetici davet kabul (token + ad/soyad teyidi + şifre min 12) |
| GET | `/api/auth/me` | Bearer | `{ userId, universityId }` döner (minimal) |

**Sistem yönetimi rotaları** (normal kullanıcı arayüzünde gösterilmez; yalnızca sistem yönetim paneli için):

| Method | Path | Permission | Açıklama |
|---|---|---|---|
| PATCH | `/api/auth/users/:userId/promote-admin` | `role.manage` | Kullanıcıyı admin yap |
| PATCH | `/api/auth/users/:userId/demote-admin` | `role.manage` | Adminliği kaldır |
| PATCH | `/api/auth/users/:userId/promote-super-admin` | `role.manage` | Kullanıcıyı super_admin yap (**tüm sistem yetkisi**) |
| PATCH | `/api/auth/users/:userId/demote-super-admin` | `role.manage` | Super_adminliği kaldır |
| POST | `/api/auth/permissions` | `permission.manage` | Yeni permission oluştur |
| GET | `/api/auth/permissions` | `permission.manage` | Permission'ları listele |
| PATCH | `/api/auth/permissions/:permissionId` | `permission.manage` | Permission açıklamasını güncelle (**key değiştirilemez**) |
| POST | `/api/auth/roles` | `role.manage` | Yeni rol oluştur |
| GET | `/api/auth/roles` | `role.manage` | Rolleri (permission'larıyla) listele |
| PATCH | `/api/auth/roles/:roleId` | `role.manage` | Rol bilgilerini güncelle |
| POST | `/api/auth/roles/:roleId/permissions` | `role.manage` | Role permission ekle |
| DELETE | `/api/auth/roles/:roleId/permissions/:permissionId` | `role.manage` | Rolden permission kaldır |

Body şemaları:
- `POST /register`: `{ firstName (2-100), lastName (2-100), email, studentNumber?, password (min 8) }`
- `POST /login`: `{ email, password }`
- `POST /accept-tenant-admin-invitation`: `{ token, firstName (2-100), lastName (2-100), password (min 12) }` — tenant ve rol token'dan okunur
- Promote/demote rotaları body almaz.
- `POST /permissions`: `{ key (3-100), description? (max 256) }`
- `PATCH /permissions/:id`: `{ description }` (key sabit)
- `POST /roles`: `{ name (2-100), description?, universityId?: uuid | null }` (`null`/verilmezse sistem geneli rol)
- `PATCH /roles/:id`: `{ name?, description? }` (en az bir alan)
- `POST /roles/:roleId/permissions`: `{ permissionId: uuid }`

---

### 2) Users — `/api/users`

Tamamen self-service: her endpoint sadece giriş yapan kullanıcının kendi verisi üzerinde işlem yapar. Ayrıntılı örnekler: [auth.md](../integration/auth.md) §5.

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| GET | `/api/users/me` | Bearer | Kendi profilim (`university`, `department` ve **`roles`** ilişkileriyle) |
| GET | `/api/users/me/permissions` | Bearer | Etkin roller + permission listesi (`permissions`, `maxRank`) |
| PATCH | `/api/users/me` | Bearer | Profil güncelle |
| PATCH | `/api/users/me/password` | Bearer | Şifre değiştir |
| GET | `/api/users/me/clubs` | Bearer | Üye olduğum kulüpler (pending istekler dahil) |
| GET | `/api/users/me/applications` | Bearer | Kulüp kurma başvurularım |
| GET | `/api/users/me/advised-clubs` | Bearer | Danışmanı olduğum kulüpler (advisor rolü) |
| GET | `/api/users/me/activities` | Bearer | Katılım bildirdiğim etkinlikler (takvimim) — bkz. [Activities](#11-activities--apiactivities) |
| GET | `/api/users/me/dashboard` | Bearer | Öğrenci panel özeti (kulüp/etkinlik/istek sayaçları) — bkz. [Dashboard](#12-dashboard--feed) |
| GET | `/api/users/me/notification-preferences` | Bearer | Bildirim susturmaları + susturulabilir tip kataloğu |
| PUT | `/api/users/me/notification-preferences` | Bearer | Susturma ekle/kaldır (idempotent) — bkz. [notifications-and-limits.md](../integration/notifications-and-limits.md) §6 |

**PATCH /api/users/me** body (en az bir alan zorunlu):
```jsonc
{
  "firstName": "string (2-100, opsiyonel)",
  "lastName": "string (2-100, opsiyonel)",
  "photoUrl": "url (max 512, opsiyonel)",
  "preferredLanguage": "2 karakter ISO 639-1, örn. 'tr'/'en' (opsiyonel)"
}
```

**PATCH /api/users/me/password**
```jsonc
{ "currentPassword": "string", "newPassword": "string (min 8)" }
```

**GET /api/users/me/clubs** → `data`: `clubMembers` satırları, `club` objesi gömülü (`clubId`, `role`, `status`, `club.{name, slug, ...}`). `status: "pending"` satırlar da gelir — yetki kararında `status === "approved"` filtresi şart.

**GET /api/users/me/applications** → `data`: kullanıcının `clubApplications` kayıtları (`status: pending/approved/rejected/revision_requested`, `createdAt` azalan).

**GET /api/users/me/advised-clubs** → `data`: `clubAdvisors` satırları, gömülü `club` objesiyle. Yalnızca `advisor` rolündeki personel için anlamlıdır (başkası için boş dizi).

---

### 3) University — `/api/universities`

**Ayrıntılı request/response örnekleri ve frontend akış rehberi için `docs/integration/university.md`'ye bakın.** Bu bölüm özet kataloğudur.

Okuma (GET) rotaları **tamamen public** (auth gerektirmez) — kayıt formunda üniversite/fakülte/bölüm seçimi için. Yazma rotaları **granüler `university.*` permission'larıyla** korunur (sistem yönetim paneli). Eski tek `university.manage` yetkisi kaldırıldı; yerine kaynak+aksiyon bazlı 12 ayrı yetki geldi (aşağıdaki tabloda her satırın yetkisi belirtilmiştir). Bu, bir kullanıcıya örneğin "yalnızca fakülte ekleme" yetkisi verip "üniversite silme" yetkisi vermemeyi mümkün kılar.

**Üniversite listesi — üç yüzey:** `GET /api/universities` public kayıt formu listesi; tenant yönetim paneli kendi tenant bağlamında akademik yapıyı bu ağaç üzerinden okur; `GET /api/platform/tenants` operatör paneli için tenant + özet istatistik (kullanıcı/kulüp sayıları) döner — aynı tabloyu listeler ama amaç ve yetki farklıdır.

`:universityId` taşıyan tüm **yazma** rotaları `tenantScoped`'tır: `:universityId` çağıranın kendi üniversitesiyle eşleşmeli — **`super_admin` bu kontrolü bypass eder** (herhangi bir üniversiteyi hedefleyebilir). Üniversite oluşturma (`POST /`) doğası gereği tenantScoped değildir (henüz tenant yoktur).

**Üniversite (tenant)**

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/universities?search=...` | Yok (public) | Üniversiteleri listele (opsiyonel arama, 1-256 karakter) |
| GET | `/api/universities/:universityId` | Yok (public) | Tek üniversite (domainleriyle) |
| POST | `/api/universities` | `university.create` | Yeni üniversite oluştur (domainleriyle) |
| PATCH | `/api/universities/:universityId` | `university.update` | Üniversite bilgilerini güncelle |
| DELETE | `/api/universities/:universityId` | `university.delete` | Üniversite sil (bağlı fakülte/kullanıcı/kulüp varsa reddedilir) |

**Domainler** (e-posta domainleri — kayıt akışında tenant çözümü için)

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/universities/:universityId/domains` | Yok (public) | Domainleri listele |
| POST | `/api/universities/:universityId/domains` | `university.domain.create` | Domain ekle |
| PATCH | `/api/universities/:universityId/domains/:domainId` | `university.domain.update` | Domain güncelle |
| DELETE | `/api/universities/:universityId/domains/:domainId` | `university.domain.delete` | Domain sil (**son domain silinemez**) |

**Fakülteler**

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/universities/:universityId/faculties` | Yok (public) | Fakülteleri listele |
| GET | `/api/universities/:universityId/faculties/:facultyId` | Yok (public) | Tek fakülte |
| POST | `/api/universities/:universityId/faculties` | `university.faculty.create` | Fakülte oluştur |
| PATCH | `/api/universities/:universityId/faculties/:facultyId` | `university.faculty.update` | Fakülte güncelle |
| DELETE | `/api/universities/:universityId/faculties/:facultyId` | `university.faculty.delete` | Fakülte sil (**bölümü varsa reddedilir**) |

**Okul geneli duyurular** (`announcement.university.manage`, tenantScoped):

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| GET | `/api/universities/:universityId/announcements` | Bearer | Tenant duyuruları (öğrenci: yalnızca yayınlanmış) |
| POST | `/api/universities/:universityId/announcements` | `announcement.university.manage` | Oluştur / yayınla (saatte 5 hız sınırı) |
| POST | `/api/universities/:universityId/announcements/:id/publish` | `announcement.university.manage` | Taslak yayınla |
| PATCH | `/api/universities/:universityId/announcements/:id` | `announcement.university.manage` | Sabitleme / zamanlanmış yayın güncelle |
| DELETE | `/api/universities/:universityId/announcements/:id` | `announcement.university.manage` | Sil |

**Tenant ayarları** (`university.settings.manage`, tenantScoped):

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| GET | `/api/universities/:universityId/settings` | `university.settings.manage` | Çözümlenmiş ayarlar + katalog metadata |
| PATCH | `/api/universities/:universityId/settings` | `university.settings.manage` | Kısmi güncelleme; `null` = varsayılana dönüş |

**Akademik dönemler** (`university.academic_term.manage`, tenantScoped):

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| GET | `/api/universities/:universityId/academic-terms` | `university.academic_term.manage` | Dönem listesi (`isActive` türetilmiş) |
| POST | `/api/universities/:universityId/academic-terms` | aynı | Dönem oluştur (çakışan aralık → 400) |
| PATCH | `/api/universities/:universityId/academic-terms/:termId` | aynı | Güncelle |
| DELETE | `/api/universities/:universityId/academic-terms/:termId` | aynı | Sil (bağlı üyelik olayı varsa → 400) |

Body: `{ name, startsAt, endsAt (ISO 8601), status?: "open"|"closed" }`.

**Bölümler** (her zaman `facultyId` üzerinden — `departments` tablosu `universityId` taşımaz)

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/universities/:universityId/faculties/:facultyId/departments` | Yok (public) | Bölümleri listele |
| GET | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | Yok (public) | Tek bölüm |
| POST | `/api/universities/:universityId/faculties/:facultyId/departments` | `university.department.create` | Bölüm oluştur |
| PATCH | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | `university.department.update` | Bölüm güncelle |
| DELETE | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | `university.department.delete` | Bölüm sil (**bağlı kullanıcı varsa reddedilir**) |

Yazma body şemaları:
- `POST /`: `{ name (2-256), slug (2-256), domains: [{ domain (3-256), domainType: "student"|"staff" }] (min 1) }` — slug ve tüm domainler benzersiz olmalı.
- `PATCH /:universityId`: `{ name?, slug? }` (en az bir alan)
- `POST .../domains`: `{ domain (3-256), domainType }`
- `PATCH .../domains/:domainId`: `{ domain?, domainType? }` (en az bir alan)
- `POST .../faculties` ve `PATCH .../faculties/:facultyId`: `{ name (2-256) }`
- `POST .../departments` ve `PATCH .../departments/:departmentId`: `{ name (2-256) }`
- `DELETE` rotaları body almaz.

Kayıt formu akışı için önerilen sıra: üniversite seç → fakülte seç → bölüm seç. **Not:** `departments` tablosu `universityId` taşımaz (kasıtlı), bu yüzden bölüm listesi mutlaka `facultyId` üzerinden çekilmeli.

---

### 4) Clubs — `/api/clubs`

**Ayrıntılı request/response örnekleri, roller ve uçtan uca senaryolar için `docs/integration/clubs.md`'ye bakın.** Bu bölüm özet kataloğudur.

Tüm endpoint'ler `authMiddleware` gerektirir; kendi üniversitenin kulüpleriyle sınırlıdır (path'te `universityId` yoktur — JWT'den çözülür). Yetki **kulüp-içi rolden** (`clubMembers.role` + danışmanlık) gelir, global RBAC'tan değil (`club.middleware`).

**Keşif ve üyelik (her giriş yapmış kullanıcı):**

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/clubs?search=` | Kendi üniversitemdeki **onaylı** kulüpler (ada göre alfabetik; `search`=`name ILIKE`) |
| GET | `/api/clubs/:clubId` | Kulüp detayı (danışmanlar, onaylı üyeler, iletişim linkleri) |
| GET | `/api/clubs/:clubId/members` | Kulübün onaylı üyeleri (rolleriyle) |
| POST | `/api/clubs/:clubId/join` | Kulübe katıl (yalnızca approved kulüp; joinPolicy'ye göre approved/pending) |
| DELETE | `/api/clubs/:clubId/leave` | Kulüpten ayrıl (başkan devretmeden ayrılamaz) |

**Kulüp kurma başvuruları (başvuran self-service):**

| Method | Path | Açıklama |
|---|---|---|
| POST | `/api/clubs/applications` | Yeni başvuru (aynı anda tek aktif başvuru: `pending` veya `revision_requested`) |
| GET | `/api/clubs/applications/:applicationId` | Kendi başvurumun detayı (`revisionRequest` alanı revizyon beklerken) |
| GET | `/api/clubs/applications/:applicationId/history` | Kendi başvurumun süreç geçmişi (sınırlı DTO — SKS iç notları yok) |
| PATCH | `/api/clubs/applications/:applicationId/resubmit` | Revizyon sonrası yeniden gönder (aynı kayıt) |
| DELETE | `/api/clubs/applications/:applicationId` | Bekleyen başvurumu geri çek |

**Kuruluş önerisi / dijital destek (tenant eşik > 0):**

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/clubs/formation-proposals` | Açık öneriler (keşif) |
| GET | `/api/clubs/formation-proposals/:id` | Öneri detayı |
| POST | `/api/clubs/formation-proposals/:id/support` | Destek ver |
| DELETE | `/api/clubs/formation-proposals/:id/support` | Desteği geri çek |
| DELETE | `/api/clubs/formation-proposals/:id` | Öneriyi geri çek (sahip) |

`POST /api/clubs/applications` tenant ayarına göre `kind: "application"` veya `kind: "formation_proposal"` döner.

**Kulüp-içi yönetim (kulüp rolüne göre):**

| Method | Path | Kim |
|---|---|---|
| GET | `/api/clubs/:clubId/join-requests` | **staff**: danışman/officer/başkan |
| PATCH | `/api/clubs/:clubId/join-requests/:userId` | officer/başkan |
| DELETE | `/api/clubs/:clubId/members/:userId` | officer/başkan (başkan çıkarılamaz) |
| PATCH | `/api/clubs/:clubId/members/:userId/role` | **yalnızca başkan** (member↔officer) |
| POST | `/api/clubs/:clubId/transfer-presidency` | **yalnızca başkan** (eski başkan officer olur) |
| GET | `/api/clubs/:clubId/membership-history` | **staff**: danışman/officer/başkan; sayfalanabilir, `?academicTermId=` |
| GET | `/api/clubs/:clubId/current-board` | **onaylı üye**: güncel yönetim/denetleme kurulu (asil/yedek, unvan) |
| GET | `/api/clubs/:clubId/general-meetings` | **staff**: genel kurul kayıtları (`attendeeCount` liste yanıtında) |
| GET | `/api/clubs/:clubId/general-meetings/:meetingId` | **staff**: genel kurul detayı |
| POST | `/api/clubs/:clubId/general-meetings` | officer/başkan: genel kurul + kurul seçimi kaydı |
| GET | `/api/clubs/:clubId/handover-records` | **staff**: devir teslim kayıtları |
| GET | `/api/clubs/:clubId/handover-records/:handoverId` | **staff**: devir teslim detayı |
| POST | `/api/clubs/:clubId/handover-records` | officer/başkan: dönemsel devir teslim (`generalMeetingId`) |
| PATCH | `/api/clubs/:clubId` | **yalnızca başkan** (profil düzenle; durum HARİÇ) |
| POST | `/api/clubs/:clubId/contact-links` | officer/başkan |
| PATCH | `/api/clubs/:clubId/contact-links/:linkId` | officer/başkan (yalnızca url) |
| DELETE | `/api/clubs/:clubId/contact-links/:linkId` | officer/başkan |

Body şemaları:
- `POST /applications`, `PATCH /applications/:id/resubmit`: `{ proposedName (3-256), description? (max 2000) }`
- `POST /applications/:id/appeal`: `{ note (10-2000) }` — reddedilen başvuruya **bir kez** itiraz
- `POST /:clubId/join`, `DELETE .../leave`: body almaz.
- `PATCH .../join-requests/:userId`: `{ "decision": "approved" | "rejected" }`
- `PATCH .../members/:userId/role`: `{ "role": "member" | "officer" }` — `president` atanamaz (devir ayrı endpoint).
- `POST .../transfer-presidency`: `{ "newPresidentId": "uuid" }` (kulübün onaylı üyesi olmalı).
- `POST .../handover-records`: `{ "generalMeetingId": "uuid", "handoverAt?": "datetime" }` — genel kurul kararına dayalı devir teslim.
- `PATCH /:clubId`: en az bir alan → `{ name?, description?, logoUrl?, coverUrl?, joinPolicy? }` (`status` yok).
- `POST .../contact-links`: `{ "platform": "whatsapp|instagram|discord|telegram|twitter|website|email|other", "url": "url (max 512)" }` — platform başına tek link.
- `PATCH .../contact-links/:linkId`: `{ "url": "url (max 512)" }` (platform sabit).

**GET /api/clubs/:clubId** → `data` şekli:
```jsonc
{
  // ...clubs tablosu kolonları (id, name, slug, description, logoUrl, coverUrl, status, joinPolicy, createdBy, ...)
  "advisors": [ /* safe user objeleri */ ],
  "clubMembers": [ { "role": "member|officer|president", "status": "approved", "user": { /* safe user */ } } ], // sadece approved üyeler
  "contactLinks": [ { "id": "...", "platform": "...", "url": "..." } ]
}
```

---

### 5) Announcements — `/api/clubs/:clubId/announcements`

`clubs.routes.ts` içine mount edilmiştir, path'e dikkat: kulübe özel alt-kaynak (bağımsız bir `/api/announcements` yoktur).

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/clubs/:clubId/announcements` | Bearer | Kulübün duyurularını listele (görünürlük serviste) |
| POST | `/api/clubs/:clubId/announcements` | staff (danışman/officer/president) | Duyuru oluştur |
| POST | `/api/clubs/:clubId/announcements/:announcementId/publish` | staff | Taslak duyuruyu yayınla |
| PATCH | `/api/clubs/:clubId/announcements/:announcementId` | staff | Sabitleme / görünürlük / zamanlanmış yayın güncelle |
| DELETE | `/api/clubs/:clubId/announcements/:announcementId` | staff (danışman/officer/president) | Duyuru sil |

**POST** body: `{ "title": "string (3-256)", "content": "string (1-5000)", "visibility?": "university"|"members", "pinned?": bool, "publish?": bool (vars. true), "scheduledPublishAtLocal?": "YYYY-MM-DDTHH:mm" (tenant yerel) }`. Ayrıntı: [integration/announcements.md](../integration/announcements.md).

**PATCH** body: `{ "pinned?", "visibility?", "scheduledPublishAtLocal?": "YYYY-MM-DDTHH:mm" | null }` — `null` zamanlamayı iptal eder.

---

### 6) Gallery — `/api/clubs/:clubId/gallery`

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/clubs/:clubId/gallery` | Bearer (herkes) | Kulübün galerisini listele |
| POST | `/api/clubs/:clubId/gallery` | staff (danışman/officer/president) | Görsel ekle |
| DELETE | `/api/clubs/:clubId/gallery/:imageId` | staff (danışman/officer/president) | Görsel sil |

**POST** body: `{ "imageUrl": "url (max 512)", "caption": "string (max 256, opsiyonel)" }`

`GET` yanıtında tenant `feed.social.preview` açıkken her görsele `commentCount`, `likeCount`, `recentComments` (demo; T2.7'de gerçek özellik). Bayrak kapalı → alanlar yok.

> Not: `imageUrl`/`logoUrl`/`coverUrl`/`photoUrl` her yerde düz URL string olarak alınır. Bu URL'yi **`POST /api/uploads`** ile (gerçek dosya yükleyip) üretebilirsiniz — bkz. [Media](#13-media--dosya-yükleme). Alternatif olarak harici bir servisin (S3/Cloudinary) URL'si de verilebilir.

---

### 7) Admin — `/api/admin`

Tüm endpoint'ler `guard(<permission>, { tenantScoped: true })` zincirinden geçer: path'teki `:universityId` **çağıran kullanıcının kendi üniversitesiyle eşleşmeli** (`super_admin`/`platform_support` bypass). Kulüp yönetiminin ayrıntısı için `docs/integration/clubs.md §11`.

| Method | Path | Permission | Açıklama |
|---|---|---|---|
| GET | `/api/admin/universities/:universityId/users?status=&role=` | `user.view` | Kullanıcıları listele (`roles` dahil) |
| GET | `/api/admin/universities/:universityId/users/:userId` | `user.view` | Tek kullanıcı (roller, üyelikler, override'lar) |
| GET | `/api/admin/universities/:universityId/users/:userId/effective-permissions` | `user.view` | Etkin roller + yetkiler |
| PATCH | `/api/admin/universities/:universityId/users/:userId/department` | `user.manage` | Kullanıcının bölümünü güncelle |
| GET | `/api/admin/universities/:universityId/audit/summary?from=&to=&academicTermId=` | `audit.view` | Kurum faaliyet özeti (dönem sayımları) |
| GET | `/api/admin/universities/:universityId/audit/decisions?from=&to=&academicTermId=&limit=&cursor=&actorId=&targetId=` | `audit.view` | Karar odaklı denetim akışı (keyset `(createdAt,id)`) |

> **Kullanıcı durumu (ban/unban), şifre sıfırlama ve kullanıcı aktivitesi artık `/api/moderation` altındadır** (bkz. [Moderation](#8-moderation--apimoderation) ve `docs/integration/moderation.md`). Eski `PATCH .../users/:userId/status` endpoint'i **kaldırıldı**.
| GET | `/api/admin/universities/:universityId/club-applications?status=` | `club.approve` | Kulüp başvurularını listele (`approvals` gömülü; `revision_requested` ayrı kuyruk) |
| GET | `/api/admin/universities/:universityId/club-applications/my-committee-pending` | kurul üyeliği | Oy bekleyen kurul başvuruları (`application.view` gerekmez) |
| GET | `/api/admin/universities/:universityId/club-applications/:applicationId` | `application.view` veya kurul kademesi üyeliği | Tek başvuru detayı (`applicant`, `approvals`, `revisionRequestCount`) |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/approve` | `application.view` | Sıradaki onay kademesini onayla — **tüm kademeler** onaylandığında kulüp oluşur |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/reject` | `application.view` | Sıradaki kademeyi reddet (`note` zorunlu) |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/request-revision` | `application.view` | Revizyon talep et (`note` zorunlu) |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/committee-vote` | `application.view` veya kurul kademesi üyeliği | Kurul kademesi oy (`vote`, ops. `reason`) |
| GET | `/api/admin/universities/:universityId/club-applications/:applicationId/history` | `application.view` | Başvuru olay geçmişi |
| GET | `/api/admin/universities/:universityId/club-applications/:applicationId/checklist` | `application.view` | İnceleme kontrol listesi |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/checklist/:itemKey` | `application.view` | Kontrol listesi madde işaretle |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/appeal/review` | `application.view` | İtiraz incele (`decision`: upheld/dismissed) |
| GET | `/api/admin/universities/:universityId/formation-proposals?status=` | `application.view` | Kuruluş önerileri listesi |
| GET | `/api/admin/universities/:universityId/formation-proposals/:id` | `application.view` | Öneri detayı (destekçi listesi gömülü) |
| GET | `/api/admin/universities/:universityId/approval-committees` | `university.approval_committee.manage` | Onay kurullarını listele |
| GET | `/api/admin/universities/:universityId/approval-committees/:committeeId` | `application.view` | Kurul detayı (oylama arayüzü için) |
| POST | `/api/admin/universities/:universityId/approval-committees` | `university.approval_committee.manage` | Kurul oluştur (`name`, `memberUserIds`) |
| PATCH | `/api/admin/universities/:universityId/approval-committees/:committeeId` | `university.approval_committee.manage` | Kurul güncelle |

Çok kademeli onay zinciri tenant ayarı `club.application.approval_chain` ile yapılandırılır (varsayılan `["club_approver"]`). Eski format: rol dizisi (`["advisor","student_affairs"]`). Yeni format: adım nesneleri — `role_sequential` veya `committee_majority` (+ `committeeId`). Kurul kademesinde `committee-vote`; salt çoğunluk üye sayısı üzerinden. Özet `application.status` adımlardan türetilir; nihai karar bildirimi yalnızca `approved`/`rejected`. Sıra ihlali → `400`; yanlış rol → `403`. Bkz. `docs/integration/admin-panel.md` §5.2.
| GET | `/api/admin/universities/:universityId/clubs?status=` | `club.update` | Kulüpleri listele |
| GET | `/api/admin/universities/:universityId/clubs/:clubId` | `club.view` | Kulüp detayı + `counts` özeti |
| PATCH | `/api/admin/universities/:universityId/clubs/:clubId/status` | `club.update` | Kulüp durumunu güncelle |
| PATCH | `/api/admin/universities/:universityId/clubs/:clubId` | `club.update` | Kulüp bilgilerini güncelle (ad, açıklama, logo, kapak, joinPolicy) |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId` | `club.delete` | Kulübü **kalıcı sil** (önce archived/rejected olmalı) |
| GET | `/api/admin/universities/:universityId/clubs/:clubId/advisors` | `club.advisor.manage` | Aktif danışmanları listele |
| POST | `/api/admin/universities/:universityId/clubs/:clubId/advisors` | `club.advisor.manage` | Danışman **daveti** (`userId`, ops. `message`) |
| GET | `/api/admin/universities/:universityId/clubs/:clubId/advisor-invitations` | `club.advisor.manage` | Bekleyen danışman davetleri |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId/advisor-invitations/:invitationId` | `club.advisor.manage` | Bekleyen daveti iptal |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId/advisors/:userId` | `club.advisor.manage` | Danışmanı zorla kaldır |

Body şemaları:
- `PATCH .../users/:userId/department`: `{ "departmentId": "uuid" | null }`
- `PATCH .../clubs/:clubId/status`: `{ "status": "pending" | "approved" | "rejected" | "archived" }`
- `PATCH .../clubs/:clubId`: en az bir alan → `{ name? (3-256), description? (max 2000), logoUrl?, coverUrl?, joinPolicy? }`
- `DELETE .../clubs/:clubId`: body almaz — yalnızca `archived`/`rejected` kulüp silinir, bağlı içerik (üye/danışman/link/duyuru/galeri) cascade temizlenir.
- `POST .../advisors`: `{ "userId": "uuid", "message?": "string" }` — hedef aynı üniversiteden ve `advisor` rolünde olmalı; kabul edilene kadar aktif danışman sayılmaz.
- Query filtreleri (`?status=`) hepsi opsiyonel; enum değerleri ilgili tablonunkilerle aynı.

---

### 8) Platform — `/api/platform`

SaaS operatör paneli: tenant listesi (stats) ve durum yönetimi. Tenant-scoped **değil**.
Ayrıntı: `docs/integration/platform-panel.md`.

| Method | Path | Permission | Açıklama |
|---|---|---|---|
| GET | `/api/platform/tenants` | `platform.tenant.view` | Tenant listesi + özet istatistikler (keyset: `limit`, `cursor`, ops. `search`) → `{ items, nextCursor }` |
| POST | `/api/platform/tenants/onboard` | `university.create` (+ `platform.tenant.invite` if `initialAdmin`) | Atomik tenant açma + opsiyonel ilk yönetici **daveti** (şifre yok) |
| GET | `/api/platform/tenants/:universityId/invitations` | `platform.tenant.invite` | Bekleyen tenant yönetici davetleri |
| POST | `/api/platform/tenants/:universityId/invite-admin` | `platform.tenant.invite` | Tenant yöneticisi daveti (şifre yok; mail commit sonrası) |
| POST | `/api/platform/tenants/:universityId/invitations/:invitationId/cancel` | `platform.tenant.invite` | Bekleyen daveti iptal |
| PATCH | `/api/platform/tenants/:universityId/status` | `platform.tenant.manage` | Tenant durumu (`reason` zorunlu) |
| GET | `/api/platform/users` | `platform.user.view` | Platform hesap listesi |
| POST | `/api/platform/users` | `super_admin` rolü | Platform hesabı oluştur |

---

### 9) Moderation — `/api/moderation`

Kullanıcı yönetimi/moderasyon yüzeyi: ban/unban (sebepli), admin şifre sıfırlama,
kullanıcının denetim aktivitesi ve moderasyon geçmişi. Tüm rotalar
`guard(<permission>, { tenantScoped: true })` — `:universityId` çağıranın kendi
üniversitesiyle eşleşmeli (super_admin/platform_support bypass). **Ayrıntılı örnekler:
`docs/integration/moderation.md`.**

| Method | Path | Permission | Açıklama |
|---|---|---|---|
| POST | `/api/moderation/universities/:universityId/users/:userId/ban` | `user.manage` | Kullanıcıyı askıya al (**sebep zorunlu**) |
| POST | `/api/moderation/universities/:universityId/users/:userId/unban` | `user.manage` | Askıyı kaldır |
| POST | `/api/moderation/universities/:universityId/users/:userId/reset-password` | `user.manage` | Şifre sıfırla (**geçici şifre bir kez döner**) |
| GET | `/api/moderation/universities/:universityId/users/:userId/activity` | `user.view` | Kullanıcının denetim (audit) aktivitesi (cursor) |
| GET | `/api/moderation/universities/:universityId/users/:userId/moderation-history` | `user.view` | Ban/unban/şifre-sıfırlama geçmişi (cursor) |

Body / dönüş:
- `POST .../ban`: `{ "reason": "string (3-500)" }` → `data`: güncel kullanıcı (`status: "suspended"`).
- `POST .../unban`: body yok → `data`: kullanıcı (`status: "active"`).
- `POST .../reset-password`: body yok → `data`: `{ "temporaryPassword": "..." }` (**yalnızca bu yanıtta; güvenli kanaldan iletin**). Kullanıcı bir sonraki girişte `mustChangePassword: true` alır.
- `GET .../activity` & `.../moderation-history`: `?limit=1-100&cursor=<ISO>` → `data`: `{ items, nextCursor }` (keyset sayfalama).

---

### 10) Notifications — `/api/notifications`

Kalıcı bildirimler + gerçek zamanlı WebSocket teslimatı. Tüm REST rotaları
`authMiddleware` + `requireActiveUser` ister (`pending` kullanıcı bildirimleri
okuyabilir; `suspended` kesilir). **Ayrıntılı mimari:** `docs/architecture/notifications.md`.

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/api/notifications/ws-ticket` | Bearer | WS için 60sn tek kullanımlık ticket |
| GET | `/api/notifications/ws?ticket=<uuid>` | ticket | WebSocket upgrade (header taşınamaz) |
| GET | `/api/notifications?limit=20&cursor=<ISO>` | Bearer | Bildirim listesi (keyset, en yeni → eski) |
| GET | `/api/notifications/unread-count` | Bearer | Okunmamış sayısı (zil rozeti) |
| PATCH | `/api/notifications/:notificationId/read` | Bearer | Tek bildirimi okundu işaretle |
| PATCH | `/api/notifications/read-all` | Bearer | Tümünü okundu işaretle |
| GET | `/api/notifications/push-key` | Bearer | Web Push VAPID anahtarı (`enabled`, `publicKey`) |
| POST | `/api/notifications/push-subscribe` | Bearer | Push aboneliği kaydet |
| DELETE | `/api/notifications/push-subscribe` | Bearer | Push aboneliğinden çık |

**WebSocket akışı:**
1. `POST /api/notifications/ws-ticket` → `{ ticket, expiresIn: 60 }`
2. `GET /api/notifications/ws?ticket=<ticket>` → upgrade; sunucu `{ event: "ready" }` yollar
3. Bildirim gelince `{ event: "notification", data: { id, type, title, body, ... } }`
4. Heartbeat: sunucu `ping` → istemci düz metin `"pong"` cevabı

Body şemaları:
- `GET /` query: `limit` (1–50, varsayılan 20), `cursor` (ISO 8601 `createdAt`)
- `POST /push-subscribe`: `{ endpoint, keys: { p256dh, auth } }` (PushSubscription JSON)
- `DELETE /push-subscribe`: `{ endpoint }`

Örnek liste yanıtı:
```jsonc
{
  "success": true,
  "message": "...",
  "data": {
    "items": [
      { "id": "...", "type": "club.membership.decided", "title": "...", "body": "...",
        "data": { "clubId": "...", "status": "approved" }, "readAt": null, "createdAt": "..." }
    ],
    "nextCursor": "2026-07-09T12:00:00.000Z"  // yoksa null — son sayfa
  }
}
```

---

### 11) Audit — `/api/audit`

Append-only denetim izi — **salt-okunur**; yazma/silme endpoint'i yoktur (kayıtlar
`guard()` zincirindeki `auditTrail` tarafından otomatik üretilir).
**Ayrıntı:** `docs/reference/error-and-audit.md`.

| Method | Path | Permission | Açıklama |
|---|---|---|---|
| GET | `/api/audit/universities/:universityId` | `audit.view` (tenant-scoped) | Denetim kayıtları (cursor + filtre) |

Query parametreleri:
- `limit` (1–100, varsayılan 50)
- `cursor` (ISO 8601 — keyset sayfalama, bildirimlerle aynı desen)
- `actorId` (uuid) — "bu kişi neler yaptı?"
- `action` (string, max 128) — yetki anahtarı: `user.manage`, `club.approve`, …
- `targetId` (string) — "bu kaynağa kimler dokundu?"

Örnek yanıt:
```jsonc
{
  "success": true,
  "message": "...",
  "data": {
    "items": [
      {
        "id": "...", "actorId": "...", "action": "user.manage",
        "method": "POST", "path": "/api/moderation/universities/.../ban",
        "status": 200, "targetType": "user", "targetId": "...",
        "metadata": { "params": {}, "body": { "reason": "[GİZLENDİ]" } },
        "ip": "...", "universityId": "...", "createdAt": "...",
        "actor": { "id": "...", "firstName": "...", "lastName": "...", "email": "..." }
      }
    ],
    "nextCursor": null
  }
}
```

`audit.view` yetkisi: `auditor`, `university_admin`, `platform_support`, `super_admin`.
### 12) Activities — `/api/activities`

Kulüp etkinlikleri: keşif, katılım (RSVP), takvim ve kulüp-içi yönetim.
**Tam derinlemesine referans (kavramsal model, co-host/cross-university, tüm
request/response örnekleri): [`docs/integration/activities.md`](../integration/activities.md).**

Kilit tasarım: etkinlik ↔ kulüp **M:N** (`activity_clubs`, host/co_host). Bir etkinliğin
tek bir `universityId`'si **yoktur** — tenant'ı katılan kulüplerden türetilir; co-hosted
etkinlik birden fazla üniversitenin keşif akışında görünebilir (turnuva senaryosu).

`GET /api/activities` ve `GET /api/clubs/:clubId/activities` listelerinde tenant
`feed.social.preview` açıkken kartlara `commentCount`, `likeCount`, `recentComments`
gömülür (demo katman; yazma ucu yok).

**Keşif + RSVP** (Bearer; tenant JWT'den):

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/activities?scope=upcoming\|past\|all&search=` | Üniversite geneli yayınlanmış + `university` veya `inter_university` görünürlüklü etkinlikler |
| GET | `/api/activities/:activityId` | Detay (görünürlük/tenant/yayın kuralları uygulanır) |
| POST | `/api/activities/:activityId/rsvp` | Katılım bildir — `{ status: "going"\|"interested" }` (vars. `going`, kapasite kontrollü) |
| DELETE | `/api/activities/:activityId/rsvp` | Katılımı geri al (idempotent) |
| POST | `/api/activities/:activityId/check-in` | QR yoklama — `{ token }`; RSVP + görünürlük; ikinci okutma no-op |

**Kulüp-içi yönetim** — `/api/clubs/:clubId/activities` (kulüp alt-kaynağı; yazma = host staff):

| Method | Path | Kim |
|---|---|---|
| GET | `/api/clubs/:clubId/activities` | Bearer (herkes; `members` yalnızca üyeye, taslak yalnızca staff'a) |
| POST | `/api/clubs/:clubId/activities` | host staff (bu kulüp host; `publish:false` → taslak) |
| PATCH | `/api/clubs/:clubId/activities/:activityId` | host staff |
| POST | `.../:activityId/publish` | host staff (taslağı yayınla) |
| POST | `.../:activityId/cancel` | host staff (katılımcılara bildirim) |
| GET | `.../:activityId/attendees` | host staff |
| POST\|DELETE | `.../:activityId/attendees/:userId/check-in` | host staff (yoklama işaretle/geri al) |
| GET | `.../:activityId/check-in-qr` | host staff (dönen yoklama QR token'ı, ~30s ömür) |
| POST\|GET | `.../:activityId/co-hosts` | host staff (kulüp davet et `{clubId}` / listele) |
| DELETE | `.../:activityId/co-hosts/:coClubId` | host staff (co-host kaldır) |
| POST\|DELETE | `.../:activityId/co-host[/accept]` | co-host staff (daveti kabul / reddet-ayrıl) |
| POST | `/api/admin/universities/:uid/activities/:activityId/cancel` | `activity.moderate` (tenant) | **Moderasyon:** tenant'taki herhangi bir kulübün etkinliğini iptal etme |
| PATCH | `/api/admin/universities/:uid/clubs/:clubId/activities/:activityId` | `activity.moderate` (tenant) | Görünürlük güncelle — `{ visibility }` (`inter_university` dahil; SKS) |

Body: `POST create` → `{ title (3-256), description?, location?, coverUrl?, startsAt (ISO), endsAt?, capacity? (pozitif int), visibility? ("university"|"members"), publish? (bool, vars. true), scheduledPublishAtLocal? ("YYYY-MM-DDTHH:mm", tenant yerel) }`; `PATCH` aynı alanlar opsiyonel + `scheduledPublishAtLocal: null` iptal (en az bir). Co-host **M:N**: `:clubId` işlemi yapan kulüp (davet=host, kabul=co-host); yalnızca `accepted` bağ tenant/görünürlükte sayılır — cross-university turnuva böyle kurulur. Bildirim tipleri: `activity.published`, `activity.cancelled`, `activity.coHostInvited`.

---

### 13) Dashboard & Feed — `/api/feed`

Rollere göre özet/akış (okuma modeli — mevcut veriyi birleştirir).
**Tam referans: [`docs/integration/dashboard.md`](../integration/dashboard.md).**

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/feed?limit=&cursor=` | Bearer | Öğrenci akışı: kulüplerimin duyuru+etkinlikleri (keyset) |
| GET | `/api/users/me/dashboard` | Bearer | Öğrenci özeti (kulüp/etkinlik/istek sayaçları + en yakın etkinlik) |
| GET | `/api/clubs/:clubId/dashboard` | kulüp staff | Kulüp özeti (üye/istek/etkinlik/duyuru sayaçları) |
| GET | `/api/admin/universities/:universityId/dashboard` | `dashboard.view` (tenant) | Tenant özeti (kulüp/kullanıcı durum dağılımı + bekleyen başvuru + yaklaşan etkinlik) |

Feed öğesi: `{ type: "announcement"|"activity", at (ISO), club, item }`. Keyset cursor opak
(`at`+`kind`+`id` tie-break); `nextCursor` doluysa `?cursor=` ile devam (ISO legacy kabul).

---

### 14) Media — `/api/uploads`

Gerçek dosya yükleme. **Tam referans: [`docs/integration/media.md`](../integration/media.md).**
Akış: **yükle → dönen URL'yi mevcut `*Url` alanına yaz** (endpoint'ler hâlâ URL string alır).

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/api/uploads` | Bearer | multipart `file` + `purpose` → `{ id, url }`. Yalnızca görsel (magic-byte doğrulaması), ≤ `MAX_UPLOAD_BYTES` (5MB) |
| DELETE | `/api/uploads/:mediaId` | Bearer | Sil (yalnızca yükleyen) |
| GET | `/uploads/:key` | Public | Servis (`Cache-Control: immutable`) |

`purpose`: `avatar\|club_logo\|club_cover\|gallery\|other`. Boyut aşımı → `413`; görsel değil → `400`.

---

### 15) Public — `/api/public`

Kimlik doğrulama **yok**. IP başına hız sınırı (120/dk). Tam sözleşme: [`docs/integration/public.md`](../integration/public.md).

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/public/universities/:universitySlug/clubs/:clubSlug` | Kulüp tanıtım + yaklaşan `university` etkinlikleri |
| GET | `/api/public/universities/:universitySlug/activities/:activityId` | Yayınlanmış `university` etkinlik detayı |
| GET | `/api/public/qr/:code` | Afiş QR çözümleme — `active` hedef veya `expired`/`cancelled`/`not_yet_active` (404 yalnızca bilinmeyen kod) |

Gizli kaynak (`draft`, `members`, zamanlanmış taslak, başka tenant) → **404**.

#### Afiş QR yönetimi

| Method | Path | Kim | Açıklama |
|---|---|---|---|
| GET/POST | `/api/clubs/:clubId/poster-qr` | host staff | Kulüp kapsamı QR oluştur/listele |
| PATCH | `/api/clubs/:clubId/poster-qr/:qrId` | host staff | Hedef/süre/etiket güncelle |
| POST | `/api/clubs/:clubId/poster-qr/:qrId/cancel` | host staff | İptal |
| GET | `/api/clubs/:clubId/poster-qr/analytics` | host staff | Kaynak karşılaştırması (hedef bazlı) |
| GET | `/api/clubs/:clubId/poster-qr/:qrId/analytics` | host staff | Kod bazlı tarama özeti (gün/saat, tenant TZ) |
| GET/POST | `/api/universities/:universityId/poster-qr` | `poster_qr.university.manage` | Okul geneli QR |
| PATCH | `/api/universities/:universityId/poster-qr/:qrId` | aynı | Güncelle |
| POST | `/api/universities/:universityId/poster-qr/:qrId/cancel` | aynı | İptal |
| GET | `/api/universities/:universityId/poster-qr/analytics` | aynı | Kurum geneli kaynak karşılaştırması |
| GET | `/api/universities/:universityId/poster-qr/:qrId/analytics` | aynı | Kod bazlı özet |

**Kurumsal rapor dışa aktarma** (`university.export.generate`):

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/universities/:universityId/exports` | Rapor kataloğu |
| POST | `/api/universities/:universityId/exports/:reportId` | Rapor üret (`clubs`, `club-members`, `activities`, PDF: `annual-activity-report`, `application-decision-minutes`, `general-meeting-minutes`, `club-handover-minutes`) |

Detay: [integration/exports.md](../integration/exports.md).

---

### 16) Discover — `/api/discover`

Üniversiteler arası etkinlik keşfi (T10.4 — "dünya sekmesi" dilimi). Tam sözleşme:
[`docs/integration/discover.md`](../integration/discover.md).

| Method | Path | Kim | Açıklama |
|---|---|---|---|
| GET | `/api/discover/activities?limit=&cursor=&universityId=` | Bearer; tenant bayrağı açık | Ağdaki `inter_university` yaklaşan etkinlikler (keyset sayfalama) |

Tenant bayrağı (`university.inter_university.enabled`) kapalıysa **404** (403 değil). Kendi üniversitenin host etkinlikleri listede **yok**.


---

## Enum Referansı

| Enum | Değerler |
|---|---|
| `user.status` | `pending`, `active`, `suspended` |
| `activity_status` | `draft`, `published`, `cancelled` |
| `activity_visibility` | `university`, `members`, `inter_university` |
| `activity_club_role` | `host`, `co_host` |
| `activity_club_status` | `invited`, `accepted` |
| `rsvp_status` | `going`, `interested`, `waitlist` |
| `club.status` | `pending`, `approved`, `rejected`, `archived` |
| `join_policy` | `open`, `approval_required` |
| `club_role` (kulüp içi) | `member`, `officer`, `president` |
| `membership_status` | `pending`, `approved`, `rejected` |
| `application_status` / `application_approval_status` | `pending`, `approved`, `rejected` |
| `contact_platform` | `whatsapp`, `instagram`, `discord`, `telegram`, `twitter`, `website`, `email`, `other` |
| `domain_type` | `student`, `staff` |
| Global roller (seed — 9 rol) | `super_admin`, `platform_support`, `university_admin`, `student_affairs`, `academic_affairs`, `content_moderator`, `auditor`, `advisor`, `student` |
| Global permission'lar (seed) | `user.view`, `user.manage`, `audit.view`, `club.approve`, `club.update`, `club.advisor.manage`, `club.delete`, `announcement.moderate`, `gallery.moderate`, `activity.moderate`, `dashboard.view`, `role.manage`, `permission.manage`, `university.create`, `university.update`, `university.delete`, `university.domain.create`, `university.domain.update`, `university.domain.delete`, `university.faculty.create`, `university.faculty.update`, `university.faculty.delete`, `university.department.create`, `university.department.update`, `university.department.delete` (**kapalı küme değil** — `permission.manage` ile runtime'da genişletilebilir) |

---

## Bilinmesi Gereken Diğer Detaylar

- **CORS**: `hono/cors` default ayarlarla açık (tüm origin'lere izin verir) — dev için sorun yok, prod'a çıkmadan önce kısıtlanmalı.
- **Tenant izolasyonu**: `enforceTenantScope()` yalnızca path'inde `:universityId` olan yönetim rotalarında çalışır; diğer rotalarda tenant, JWT'deki `universityId` üzerinden repository sorgularında filtrelenir. Admin dışı rotalarda path'te `universityId` yoktur — frontend'in tenant param'ı göndermesi gerekmez.
- **`/api/auth/me` minimal**: Sadece `{ userId, universityId }` döner; tam profil ve roller için `GET /api/users/me` kullanılmalı.
- **`announcements`/`gallery` feature'ları `index.ts`'te ayrı mount edilmez** — `clubs.routes.ts` içinden `/:clubId/announcements` ve `/:clubId/gallery` olarak mount edilirler. `clubs.routes.ts` ayrıca kendi rotalarını `routes/` alt-dizinine böler (browse/applications/membership/management) — üniversite feature'ıyla aynı desen.
- **Kulüp başkanlığı devri** artık `POST /api/clubs/:clubId/transfer-presidency` ile yapılır (yalnızca mevcut başkan; eski başkan officer'a düşer). Böylece başkan devrettikten sonra kulüpten ayrılabilir. (member↔officer geçişi hâlâ ayrı: `.../members/:userId/role`.)
- **Kulüp kurma başvurularında** başvuran kendi başvurusunu görüntüleyebilir (`GET /api/clubs/applications/:id`), revizyon sonrası yeniden gönderebilir (`PATCH .../resubmit`) ve bekleyen başvuruyu geri çekebilir (`DELETE`). Değerlendirme (onay/red/revizyon) admin'dedir. Onay zinciri (`clubApplicationApprovals`) çok-adımlı; geçmiş `club_application_events` append-only tablosunda.
- **Etkin permission listesi:** `GET /api/users/me/permissions` → `{ roles, permissions, status }`.
  Yönetici görünümü: `GET /api/admin/.../users/:userId/effective-permissions`.
- **Rol/izin değişiklikleri anında etkilidir** — RBAC cache'i (5 dk TTL) ilgili akışlarda otomatik invalidate edilir; frontend tarafında yalnızca açık oturumdaki state'in yenilenmesi (refresh/yeniden login) gerekir.
