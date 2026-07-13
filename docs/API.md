# University Club Backend — Frontend API Dokümanı

Bu doküman, frontend ekibinin backend'i entegre ederken ihtiyaç duyacağı tüm bilgileri içerir: base URL, auth akışı, yetki (RBAC) modeli ve her endpoint'in request/response şekli.

> **İlişkili dokümanlar:**
> - `docs/FRONTEND_AUTH_RBAC.md` — Auth + RBAC yapılanmasının ayrıntılı anlatımı ve ilk 3 feature'ın (Auth, Users, University) request/response örnekli tam referansı. **Auth/RBAC detayı için asıl kaynak orasıdır**; bu doküman tüm endpoint'lerin özet kataloğudur.
> - `docs/FRONTEND_UNIVERSITY.md` — **University katmanının tam derinlemesine referansı**: granüler `university.*` yetki modeli, üniversite/domain/fakülte/bölüm CRUD'unun request/response örnekleri, silme sırası ve yönetim paneli akışları.
> - `docs/FRONTEND_CLUBS.md` — **Clubs katmanının tam derinlemesine referansı**: kulüp keşfi/üyeliği, kulüp-içi roller (member/officer/başkan), danışman (advisor) akışı, kulüp kurma başvuruları, granüler `club.*` yetki modeli ve admin kulüp yönetimi + uçtan uca senaryolar.
> - `docs/FRONTEND_AUTH_GUARD_GUIDE.md` — React tarafında route/UI guard mimarisi önerisi.
>
> Not: `message` alanları **isteğin diline** göre döner (`Accept-Language: tr|en`, varsayılan `tr`). Kalıcı mantık için mesaj metnine değil `code`/`details`/HTTP status'a bakın — bkz. [Genel Kurallar → Hata & i18n](#hata-zarf%C4%B1-ve-i18n).

## İçindekiler

- [Genel Kurallar](#genel-kurallar)
- [Kimlik Doğrulama (Auth)](#kimlik-doğrulama-auth)
- [Yetkilendirme Modeli (RBAC)](#yetkilendirme-modeli-rbac)
- [Endpoint Referansı](#endpoint-referansı)
  - [Auth](#1-auth--apiauth)
  - [Users (self-service)](#2-users--apiusers)
  - [University](#3-university--apiuniversities)
  - [Clubs](#4-clubs--apiclubs)
  - [Announcements (kulüp alt-kaynağı)](#5-announcements--apiclubsclubidannouncements)
  - [Gallery (kulüp alt-kaynağı)](#6-gallery--apiclubsclubidgallery)
  - [Admin (okul yöneticisi)](#7-admin--apiadmin)
  - [Moderation (kullanıcı yönetimi)](#8-moderation--apimoderation)
- [Enum Referansı](#enum-referansı)
- [Bilinmesi Gereken Diğer Detaylar](#bilinmesi-gereken-diğer-detaylar)

---

## Genel Kurallar

**Base URL:** `http://localhost:3000` (dev). Tüm feature route'ları `/api` altında mount edilir. Mount edilen route grupları: `/api/auth`, `/api/admin`, `/api/universities`, `/api/users`, `/api/clubs`, `/api/notifications`, `/api/audit`, `/api/moderation`. (**`/api/super-admin` diye bir route grubu yoktur** — sistem yönetimi endpoint'leri `/api/auth`, `/api/universities` ve `/api/moderation` altındadır.)

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
| Beklenmeyen | `500` | jenerik mesaj + `requestId` |

- **i18n:** `Accept-Language: tr|en` (varsayılan `tr`). Hem hata hem başarı mesajları çevrilir.
- **Doğrulama** hatasında ham `ZodError` DÖNMEZ; `details[]` = `[{ path, code, message }]`.
- **`code`** taşıyanlar: `VALIDATION_ERROR`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`. Mantığı mesaj metnine değil bu koda/HTTP status'a bağlayın.
- Ayrıntı: `docs/DENETIM_VE_HATA.md`.

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

- `roles` (seed: `student`, `advisor`, `admin`, `super_admin`) ve `permissions` (seed: `user.manage`, **granüler `club.*`** (`club.approve`/`club.update`/`club.advisor.manage`/`club.delete`), `role.manage`, `permission.manage` + **granüler `university.*` yetkileri** — bkz. University/Clubs bölümleri) tabloları.
- Bir kullanıcı birden fazla role sahip olabilir (`userRoles`); roller izin taşır (`rolePermissions`).
- `userPermissions` ile kullanıcıya doğrudan izin verilebilir/geri alınabilir (`granted: false` → rolden gelen izni override edip iptal eder).
- Bu katman **Redis'te 5 dakika cache'lenir** (`rbac.cache.ts`, key: `rbac:permissions:<userId>`). Rol/izin değiştiren tüm endpoint'ler (promote/demote, role permission ekleme/çıkarma) etkilenen kullanıcıların cache'ini **anında temizler** — yani değişiklikler bir sonraki istekte geçerlidir; 5 dakikalık gecikme yoktur. (Ancak hedef kullanıcının açık frontend oturumundaki state kendiliğinden yenilenmez — sayfa yenileme/yeniden login gerekir.)
- Bu katman `admin` feature'ının tüm endpoint'lerinde, `auth` feature'ının yönetim rotalarında ve `universities`'in yazma rotalarında kullanılır (`guard()` → `authMiddleware → attachAuthz → requirePermission("...") [→ enforceTenantScope()]`).
- `super_admin` rolü, `enforceTenantScope` kontrolünü bypass eder — yani `:universityId` path param'ı kendi üniversitesiyle eşleşmese bile işlem yapabilir. Diğer roller için `:universityId` mutlaka kendi `universityId`'leri ile eşleşmelidir, aksi halde `403`.

### 2) Kulüp bazlı roller (`clubMembers.role`)

- Sadece `member` / `officer` / `president` değerlerini alır, global roller sisteminden **tamamen bağımsızdır**.
- `clubs` ve alt-kaynaklarında (`announcements`, `gallery`, üyelik yönetimi) kullanılır: `requireClubStaff` (danışman veya officer/president), `requireClubOfficer` (officer veya president), `requireClubPresident` (sadece president).
- Bu middleware'ler, kullanıcının o kulüpte **`status: "approved"`** bir üyeliği (veya `clubAdvisors` danışmanlığı) olup olmadığını kontrol eder — pending/rejected üyelikler yetki vermez.
- **Danışman** özel bir durumdur: kulüp-içi rolü (`clubMembers`) yoktur ama `requireClubStaff` onu da "staff" sayar (duyuru/galeri girme + istek/üye görüntüleme). Karar mercii işleri (onay/çıkarma/rol/devir) danışmana kapalıdır.

### Frontend için pratik anlamı

- Global **rol adları** `GET /api/users/me` response'undaki `data.roles[]` dizisinden okunur (her eleman rol satırıdır, `name` alanı vardır).
- Global **etkin permission listesi** (`["user.manage", ...]` gibi, override'lar uygulanmış hâli) şu an **hiçbir endpoint'ten dönmez** — backend'de hesaplanıyor ama dışarı verilmiyor. UI göster/gizle kararları permission bazlı yapılmak isteniyorsa backend'e bir ek gerekir (bkz. `FRONTEND_AUTH_GUARD_GUIDE.md` §3); o zamana kadar rol adlarına bakılır.
- Kulüp bazlı rol, `GET /api/users/me/clubs` (`role`, `status` alanları) veya `GET /api/clubs/:clubId` response'undaki `clubMembers[].role`'den öğrenilir.

---

## Endpoint Referansı

### 1) Auth — `/api/auth`

Ayrıntılı request/response örnekleri için `FRONTEND_AUTH_RBAC.md` §4'e bakın.

**Public / self rotaları:**

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/api/auth/register` | Yok | Kayıt olma |
| POST | `/api/auth/login` | Yok | Giriş, JWT döner |
| GET | `/api/auth/verify?token=...` | Yok | E-posta doğrulama linki |
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
- `POST /register`: `{ firstName (2-100), lastName (2-100), email, studentNumber?, password (min 6) }`
- `POST /login`: `{ email, password }`
- Promote/demote rotaları body almaz.
- `POST /permissions`: `{ key (3-100), description? (max 256) }`
- `PATCH /permissions/:id`: `{ description }` (key sabit)
- `POST /roles`: `{ name (2-100), description?, universityId?: uuid | null }` (`null`/verilmezse sistem geneli rol)
- `PATCH /roles/:id`: `{ name?, description? }` (en az bir alan)
- `POST /roles/:roleId/permissions`: `{ permissionId: uuid }`

---

### 2) Users — `/api/users`

Tamamen self-service: her endpoint sadece giriş yapan kullanıcının kendi verisi üzerinde işlem yapar. Ayrıntılı örnekler: `FRONTEND_AUTH_RBAC.md` §5.

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| GET | `/api/users/me` | Bearer | Kendi profilim (`university`, `department` ve **`roles`** ilişkileriyle) |
| PATCH | `/api/users/me` | Bearer | Profil güncelle |
| PATCH | `/api/users/me/password` | Bearer | Şifre değiştir |
| GET | `/api/users/me/clubs` | Bearer | Üye olduğum kulüpler (pending istekler dahil) |
| GET | `/api/users/me/applications` | Bearer | Kulüp kurma başvurularım |
| GET | `/api/users/me/advised-clubs` | Bearer | Danışmanı olduğum kulüpler (advisor rolü) |

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
{ "currentPassword": "string", "newPassword": "string (min 6)" }
```

**GET /api/users/me/clubs** → `data`: `clubMembers` satırları, `club` objesi gömülü (`clubId`, `role`, `status`, `club.{name, slug, ...}`). `status: "pending"` satırlar da gelir — yetki kararında `status === "approved"` filtresi şart.

**GET /api/users/me/applications** → `data`: kullanıcının `clubApplications` kayıtları (`status: pending/approved/rejected`, `createdAt` azalan).

**GET /api/users/me/advised-clubs** → `data`: `clubAdvisors` satırları, gömülü `club` objesiyle. Yalnızca `advisor` rolündeki personel için anlamlıdır (başkası için boş dizi).

---

### 3) University — `/api/universities`

**Ayrıntılı request/response örnekleri ve frontend akış rehberi için `docs/FRONTEND_UNIVERSITY.md`'ye bakın.** Bu bölüm özet kataloğudur.

Okuma (GET) rotaları **tamamen public** (auth gerektirmez) — kayıt formunda üniversite/fakülte/bölüm seçimi için. Yazma rotaları **granüler `university.*` permission'larıyla** korunur (sistem yönetim paneli). Eski tek `university.manage` yetkisi kaldırıldı; yerine kaynak+aksiyon bazlı 12 ayrı yetki geldi (aşağıdaki tabloda her satırın yetkisi belirtilmiştir). Bu, bir kullanıcıya örneğin "yalnızca fakülte ekleme" yetkisi verip "üniversite silme" yetkisi vermemeyi mümkün kılar.

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

**Ayrıntılı request/response örnekleri, roller ve uçtan uca senaryolar için `docs/FRONTEND_CLUBS.md`'ye bakın.** Bu bölüm özet kataloğudur.

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
| POST | `/api/clubs/applications` | Yeni başvuru (aynı anda tek `pending` başvuru) |
| GET | `/api/clubs/applications/:applicationId` | Kendi başvurumun detayı (onay adımlarıyla) |
| DELETE | `/api/clubs/applications/:applicationId` | Bekleyen başvurumu geri çek |

**Kulüp-içi yönetim (kulüp rolüne göre):**

| Method | Path | Kim |
|---|---|---|
| GET | `/api/clubs/:clubId/join-requests` | **staff**: danışman/officer/başkan |
| PATCH | `/api/clubs/:clubId/join-requests/:userId` | officer/başkan |
| DELETE | `/api/clubs/:clubId/members/:userId` | officer/başkan (başkan çıkarılamaz) |
| PATCH | `/api/clubs/:clubId/members/:userId/role` | **yalnızca başkan** (member↔officer) |
| POST | `/api/clubs/:clubId/transfer-presidency` | **yalnızca başkan** (eski başkan officer olur) |
| PATCH | `/api/clubs/:clubId` | **yalnızca başkan** (profil düzenle; durum HARİÇ) |
| POST | `/api/clubs/:clubId/contact-links` | officer/başkan |
| PATCH | `/api/clubs/:clubId/contact-links/:linkId` | officer/başkan (yalnızca url) |
| DELETE | `/api/clubs/:clubId/contact-links/:linkId` | officer/başkan |

Body şemaları:
- `POST /applications`: `{ proposedName (3-256), description? (max 2000) }`
- `POST /:clubId/join`, `DELETE .../leave`: body almaz.
- `PATCH .../join-requests/:userId`: `{ "decision": "approved" | "rejected" }`
- `PATCH .../members/:userId/role`: `{ "role": "member" | "officer" }` — `president` atanamaz (devir ayrı endpoint).
- `POST .../transfer-presidency`: `{ "newPresidentId": "uuid" }` (kulübün onaylı üyesi olmalı).
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
| GET | `/api/clubs/:clubId/announcements` | Bearer (herkes) | Kulübün duyurularını listele |
| POST | `/api/clubs/:clubId/announcements` | staff (danışman/officer/president) | Duyuru oluştur |
| DELETE | `/api/clubs/:clubId/announcements/:announcementId` | staff (danışman/officer/president) | Duyuru sil |

**POST** body: `{ "title": "string (3-256)", "content": "string (1-5000)" }`

---

### 6) Gallery — `/api/clubs/:clubId/gallery`

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/clubs/:clubId/gallery` | Bearer (herkes) | Kulübün galerisini listele |
| POST | `/api/clubs/:clubId/gallery` | staff (danışman/officer/president) | Görsel ekle |
| DELETE | `/api/clubs/:clubId/gallery/:imageId` | staff (danışman/officer/president) | Görsel sil |

**POST** body: `{ "imageUrl": "url (max 512)", "caption": "string (max 256, opsiyonel)" }`

> Not: Dosya upload endpoint'i yok — `imageUrl`/`logoUrl`/`coverUrl`/`photoUrl` her yerde düz URL string olarak alınır. Görsel yükleme (S3/Cloudinary vb.) frontend veya ayrı bir servis tarafından yapılıp URL buraya verilmelidir.

---

### 7) Admin — `/api/admin`

Tüm endpoint'ler `guard(<permission>, { tenantScoped: true })` zincirinden geçer: path'teki `:universityId` **çağıran kullanıcının kendi üniversitesiyle eşleşmeli** (super_admin hariç — o herhangi bir üniversiteyi hedefleyebilir). Gerekli permission'lar seed'de `admin` rolüne atanmıştır: `user.manage` + granüler `club.*` (`club.approve`, `club.update`, `club.advisor.manage`, `club.delete`). Kulüp yönetiminin ayrıntısı için `docs/FRONTEND_CLUBS.md §11`.

| Method | Path | Permission | Açıklama |
|---|---|---|---|
| GET | `/api/admin/universities/:universityId/users?status=` | `user.manage` | Kullanıcıları listele |
| GET | `/api/admin/universities/:universityId/users/:userId` | `user.manage` | Tek kullanıcı |
| PATCH | `/api/admin/universities/:universityId/users/:userId/department` | `user.manage` | Kullanıcının bölümünü güncelle |

> **Kullanıcı durumu (ban/unban), şifre sıfırlama ve kullanıcı aktivitesi artık `/api/moderation` altındadır** (bkz. [Moderation](#8-moderation--apimoderation) ve `docs/frontend/FRONTEND_MODERASYON.md`). Eski `PATCH .../users/:userId/status` endpoint'i **kaldırıldı**.
| GET | `/api/admin/universities/:universityId/club-applications?status=` | `club.approve` | Kulüp başvurularını listele |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/approve` | `club.approve` | Başvuruyu onayla (**gerçek bir kulüp oluşturur, başvuran başkan olur**) |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/reject` | `club.approve` | Başvuruyu reddet |
| GET | `/api/admin/universities/:universityId/clubs?status=` | `club.update` | Kulüpleri listele |
| PATCH | `/api/admin/universities/:universityId/clubs/:clubId/status` | `club.update` | Kulüp durumunu güncelle |
| PATCH | `/api/admin/universities/:universityId/clubs/:clubId` | `club.update` | Kulüp bilgilerini güncelle (ad, açıklama, logo, kapak, joinPolicy) |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId` | `club.delete` | Kulübü **kalıcı sil** (önce archived/rejected olmalı) |
| GET | `/api/admin/universities/:universityId/clubs/:clubId/advisors` | `club.advisor.manage` | Danışmanları listele |
| POST | `/api/admin/universities/:universityId/clubs/:clubId/advisors` | `club.advisor.manage` | Danışman ata (hedef `advisor` rolünde olmalı) |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId/advisors/:userId` | `club.advisor.manage` | Danışman kaldır |

Body şemaları:
- `PATCH .../users/:userId/department`: `{ "departmentId": "uuid" | null }`
- `PATCH .../clubs/:clubId/status`: `{ "status": "pending" | "approved" | "rejected" | "archived" }`
- `PATCH .../clubs/:clubId`: en az bir alan → `{ name? (3-256), description? (max 2000), logoUrl?, coverUrl?, joinPolicy? }`
- `DELETE .../clubs/:clubId`: body almaz — yalnızca `archived`/`rejected` kulüp silinir, bağlı içerik (üye/danışman/link/duyuru/galeri) cascade temizlenir.
- `POST .../advisors`: `{ "userId": "uuid" }` — hedef aynı üniversiteden ve `advisor` rolünde olmalı.
- Query filtreleri (`?status=`) hepsi opsiyonel; enum değerleri ilgili tablonunkilerle aynı.

---

### 8) Moderation — `/api/moderation`

Kullanıcı yönetimi/moderasyon yüzeyi: ban/unban (sebepli), admin şifre sıfırlama,
kullanıcının denetim aktivitesi ve moderasyon geçmişi. Tüm rotalar
`guard(<permission>, { tenantScoped: true })` — `:universityId` çağıranın kendi
üniversitesiyle eşleşmeli (super_admin/platform_support bypass). **Ayrıntılı örnekler:
`docs/frontend/FRONTEND_MODERASYON.md`.**

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

## Enum Referansı

| Enum | Değerler |
|---|---|
| `user.status` | `pending`, `active`, `suspended` |
| `club.status` | `pending`, `approved`, `rejected`, `archived` |
| `join_policy` | `open`, `approval_required` |
| `club_role` (kulüp içi) | `member`, `officer`, `president` |
| `membership_status` | `pending`, `approved`, `rejected` |
| `application_status` / `application_approval_status` | `pending`, `approved`, `rejected` |
| `contact_platform` | `whatsapp`, `instagram`, `discord`, `telegram`, `twitter`, `website`, `email`, `other` |
| `domain_type` | `student`, `staff` |
| Global roller (seed — 9 rol) | `super_admin`, `platform_support`, `university_admin`, `student_affairs`, `academic_affairs`, `content_moderator`, `auditor`, `advisor`, `student` |
| Global permission'lar (seed) | `user.view`, `user.manage`, `audit.view`, `club.approve`, `club.update`, `club.advisor.manage`, `club.delete`, `announcement.moderate`, `gallery.moderate`, `role.manage`, `permission.manage`, `university.create`, `university.update`, `university.delete`, `university.domain.create`, `university.domain.update`, `university.domain.delete`, `university.faculty.create`, `university.faculty.update`, `university.faculty.delete`, `university.department.create`, `university.department.update`, `university.department.delete` (**kapalı küme değil** — `permission.manage` ile runtime'da genişletilebilir) |

---

## Bilinmesi Gereken Diğer Detaylar

- **CORS**: `hono/cors` default ayarlarla açık (tüm origin'lere izin verir) — dev için sorun yok, prod'a çıkmadan önce kısıtlanmalı.
- **Tenant izolasyonu**: `enforceTenantScope()` yalnızca path'inde `:universityId` olan yönetim rotalarında çalışır; diğer rotalarda tenant, JWT'deki `universityId` üzerinden repository sorgularında filtrelenir. Admin dışı rotalarda path'te `universityId` yoktur — frontend'in tenant param'ı göndermesi gerekmez.
- **`/api/auth/me` minimal**: Sadece `{ userId, universityId }` döner; tam profil ve roller için `GET /api/users/me` kullanılmalı.
- **`announcements`/`gallery` feature'ları `index.ts`'te ayrı mount edilmez** — `clubs.routes.ts` içinden `/:clubId/announcements` ve `/:clubId/gallery` olarak mount edilirler. `clubs.routes.ts` ayrıca kendi rotalarını `routes/` alt-dizinine böler (browse/applications/membership/management) — üniversite feature'ıyla aynı desen.
- **Kulüp başkanlığı devri** artık `POST /api/clubs/:clubId/transfer-presidency` ile yapılır (yalnızca mevcut başkan; eski başkan officer'a düşer). Böylece başkan devrettikten sonra kulüpten ayrılabilir. (member↔officer geçişi hâlâ ayrı: `.../members/:userId/role`.)
- **Kulüp kurma başvurularında** başvuran kendi başvurusunu görüntüleyebilir (`GET /api/clubs/applications/:id`) ve bekleyen başvuruyu geri çekebilir (`DELETE`). Değerlendirme (onay/red) admin'dedir. Onay zinciri (`clubApplicationApprovals`) çok-adımlı olacak şekilde genişletilebilir (şu an tek adım).
- **Etkin permission listesini döndüren bir endpoint yok** — `GET /api/users/me` rol adlarını verir ama flatten edilmiş permission listesi hiçbir yerden dönmez; permission bazlı UI guard'ı için backend'e ek gerekir (bkz. `FRONTEND_AUTH_GUARD_GUIDE.md` §3).
- **Rol/izin değişiklikleri anında etkilidir** — RBAC cache'i (5 dk TTL) ilgili akışlarda otomatik invalidate edilir; frontend tarafında yalnızca açık oturumdaki state'in yenilenmesi (refresh/yeniden login) gerekir.
