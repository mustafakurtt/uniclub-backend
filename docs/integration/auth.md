# Auth ve Self-Service Entegrasyonu

**Kapsam:** Kayıt, giriş, e-posta doğrulama, profil ve public üniversite listeleri.

- RBAC ve yönetim paneli → [admin-panel.md](admin-panel.md)
- Kulüpler, etkinlikler, dashboard → [README.md](../README.md) indeksinden ilgili rehber

> `message` alanları `Accept-Language: tr|en` ile döner. Kalıcı mantık için `code`/HTTP status kullanın ([error-and-audit.md](../reference/error-and-audit.md)).

---

## İçindekiler

- [1. Genel Kurallar](#1-genel-kurallar)
- [2. Auth Yapılanması](#2-auth-yapılanması)
- [3. RBAC — nereye bakılır](#3-rbac--nereye-bakılır)
- [4. Feature Referansı 1 — Auth (`/api/auth`)](#4-feature-referansı-1--auth-apiauth)
- [5. Feature Referansı 2 — Users (`/api/users`)](#5-feature-referansı-2--users-apiusers)
- [6. Feature Referansı 3 — University (`/api/universities`)](#6-feature-referansı-3--university-apiuniversities)
- [7. React Tarafı İçin Öneriler](#7-react-tarafı-için-öneriler)
- [8. Test Hesapları (Seed)](#8-test-hesapları-seed)
- [9. Bilinen Kısıtlar](#9-bilinen-kısıtlar)

---

## 1. Genel Kurallar

### Base URL

```
http://localhost:3000        (dev)
```

Tüm feature route'ları `/api` prefix'i altındadır. Auth gerektirmeyen bir sağlık kontrolü vardır:

```
GET /health → { "status": "ok", "environment": "development", "timestamp": "..." }
```

### Response Zarfı

Her endpoint aynı JSON zarfını döner:

```jsonc
// Başarı
{ "success": true, "message": "...", "data": { ... } }

// Hata (tek tip zarf — ham SQL/stack asla sızmaz)
{
  "success": false,
  "message": "...",           // isteğin diline çevrilir (Accept-Language)
  "code": "VALIDATION_ERROR", // OPSİYONEL, makine-okur
  "details": [ ... ],         // OPSİYONEL, alan-bazlı doğrulama hataları
  "requestId": "..."          // her hata yanıtında
}
```

**Tek istisna:** `POST /api/auth/login` — `data` yerine kökte `user` ve `token` alanlarını döner (bkz. §4.2).

### HTTP Status Kodları

| Status | Anlamı | Frontend davranışı |
|---|---|---|
| `200` | Başarılı | — |
| `201` | Kayıt oluşturuldu (POST) | — |
| `400` | Doğrulama (`code: VALIDATION_ERROR` + `details[]`) veya iş kuralı ihlali | `details` varsa alan altına, yoksa `message`'ı toast'la |
| `401` | Token yok / geçersiz / süresi dolmuş | Token'ı sil, `/login`'e yönlendir |
| `403` | Kimlik doğru ama **yetki yok** (permission / tenant scope / askılı hesap) | `message`'ı göster; ilgili ekranı gizle |
| `404` | Kaynak bulunamadı | "Bulunamadı" ekranı |
| `500` | Beklenmeyen | Jenerik hata + `requestId`'yi destek için göster |

**Doğrulama hataları artık birleşik zarfla döner** (ham `ZodError` DEĞİL): `code: "VALIDATION_ERROR"` + `details: [{ path, code, message }]`. Form alanı bazlı hata için `details[].path` kullanın; `details[].code` diller arası sabittir. **i18n:** `Accept-Language: tr|en` (varsayılan `tr`) — mesajlar buna göre çevrilir; kalıcı mantık için mesaj metnine değil `code`/HTTP status'a bakın.

### Kimlik Doğrulama Header'ı

Korumalı tüm isteklerde:

```
Authorization: Bearer <token>
```

### CORS

Dev ortamında tüm origin'lere açıktır (`hono/cors` default). Prod öncesi kısıtlanacaktır — frontend için şu an ek bir ayar gerekmez.

### Güvenlik Garantisi

`passwordHash` alanı **hiçbir** response'ta yer almaz. Kullanıcı objesi dönen her endpoint bu alanı sıyırarak döner ("safe user").

---

## 2. Auth Yapılanması

### 2.1. JWT

- **Algoritma:** HS256, **geçerlilik: 7 gün**. Refresh token mekanizması **yoktur** — token süresi dolunca kullanıcı yeniden login olmalıdır.
- **Payload:** `{ "userId": "<uuid>", "universityId": "<uuid>", "exp": <unix-seconds> }`
- Frontend token'ı decode edip `userId`/`universityId`/`exp`'i okuyabilir (ör. sessiz logout zamanlaması için), ancak **rol/izin bilgisi token'da yoktur** (bkz. §3.4).

### 2.2. Kayıt Akışı (Tenant = E-posta Domaini)

Bu sistem multi-tenant'tır (tek backend, çok üniversite). Kritik nokta: **kayıt formunda üniversite seçtirilmez.** Üniversite, e-posta adresinin domain kısmından otomatik bulunur:

```
ali@std.antalya.edu.tr → "std.antalya.edu.tr" domain tablosunda aranır
```

- Domain sistemde kayıtlı değilse kayıt **reddedilir**: `"Bu e-posta adresi sistemimizde kayıtlı bir üniversiteye ait değil."` (400)
- Domain'in tipi kayıt anında **global rolü belirler**: `student` domaini → `student` rolü, `staff` domaini → `advisor` rolü. Frontend'in rol seçtirmesi gerekmez ve mümkün de değildir.
- Aynı e-posta aynı üniversitede ikinci kez kaydolamaz.

### 2.3. E-posta Doğrulama Akışı

1. Kayıt sonrası kullanıcı `status: "pending"` olur; 24 saat geçerli tek kullanımlık bir doğrulama token'ı üretilir.
2. Doğrulama linki e-posta ile gönderilir. **Dev ortamında gerçek mail atılmaz** — link backend konsoluna loglanır (BullMQ worker). Test ederken linki backend terminalinden alın.
3. `GET /api/auth/verify?token=...` çağrılınca kullanıcı `active` olur. Token tek kullanımlıktır; ikinci çağrıda "zaten kullanılmış" hatası döner.
4. Frontend'de `/verify?token=...` gibi bir sayfa yapıp query'deki token'ı bu endpoint'e iletmeniz beklenir.

**Önemli davranış:** `pending` kullanıcılar şu an **login olabilir** (backend'de bilinçli olarak henüz engellenmemiş — ileride kulüp başvurusu gibi aksiyonlarda kısıtlanacak). `suspended` kullanıcılar ise login'de reddedilir. Frontend, `user.status === "pending"` ise "e-postanızı doğrulayın" banner'ı göstermelidir.

### 2.4. Login Kuralları

- Yanlış e-posta ve yanlış şifre **aynı mesajı** döner (`"E-posta adresi veya şifre hatalı."`, 401) — kayıtlı e-posta taraması yapılamasın diye bilinçli. Frontend'de "e-posta bulunamadı / şifre yanlış" ayrımı yapmaya çalışmayın.
- `suspended` hesap: `"Hesabınız askıya alınmıştır. Lütfen SKS birimiyle iletişime geçin."` (401)

---

## 3. RBAC — nereye bakılır

Global RBAC (9 rol, granüler permission) ve yönetim endpoint'leri bu dosyada **değil**:

| Konu | Belge |
|---|---|
| Yönetim paneli endpoint'leri | [admin-panel.md](admin-panel.md) |
| Rütbe, platform hesapları | [rank-and-platform.md](rank-and-platform.md) |
| Tasarım kararları | [design/README.md](../design/README.md) |
| Etkin permission listesi | `GET /api/users/me/permissions` |

UI göster/gizle için `permissions.includes("<key>")` kullanın; rol adına göre hardcode etmeyin.

---


## 4. Feature Referansı 1 — Auth (`/api/auth`)

### Endpoint Özeti

| # | Method | Path | Yetki | Açıklama |
|---|---|---|---|---|
| 4.1 | POST | `/api/auth/register` | — | Kayıt |
| 4.2 | POST | `/api/auth/login` | — | Giriş, JWT döner |
| 4.3 | GET | `/api/auth/verify?token=` | — | E-posta doğrulama |
| 4.4 | GET | `/api/auth/me` | Bearer | Token'daki kimlik (minimal) |
| 4.5 | PATCH | `/api/auth/users/:userId/promote-admin` | `role.manage` | Kullanıcıyı admin yap |
| 4.5 | PATCH | `/api/auth/users/:userId/demote-admin` | `role.manage` | Adminliği kaldır |
| 4.5 | PATCH | `/api/auth/users/:userId/promote-super-admin` | `role.manage` | Super admin yap |
| 4.5 | PATCH | `/api/auth/users/:userId/demote-super-admin` | `role.manage` | Super adminliği kaldır |
| 4.6 | POST | `/api/auth/permissions` | `permission.manage` | Permission oluştur |
| 4.6 | GET | `/api/auth/permissions` | `permission.manage` | Permission'ları listele |
| 4.6 | PATCH | `/api/auth/permissions/:permissionId` | `permission.manage` | Permission açıklamasını güncelle |
| 4.7 | POST | `/api/auth/roles` | `role.manage` | Rol oluştur |
| 4.7 | GET | `/api/auth/roles` | `role.manage` | Rolleri (permission'larıyla) listele |
| 4.7 | PATCH | `/api/auth/roles/:roleId` | `role.manage` | Rol bilgilerini güncelle |
| 4.7 | POST | `/api/auth/roles/:roleId/permissions` | `role.manage` | Role permission ekle |
| 4.7 | DELETE | `/api/auth/roles/:roleId/permissions/:permissionId` | `role.manage` | Rolden permission kaldır |

> 4.5–4.7 rotaları normal kullanıcı arayüzünde yer almaz; yalnızca sistem yönetim paneli yapılıyorsa bağlanır.

### 4.1. `POST /api/auth/register`

**Request:**

```jsonc
{
  "firstName": "Ali",            // zorunlu, 2-100 karakter
  "lastName": "Veli",            // zorunlu, 2-100 karakter
  "email": "ali@std.antalya.edu.tr", // zorunlu, geçerli e-posta; domain sistemde kayıtlı olmalı
  "studentNumber": "250803999",  // opsiyonel
  "password": "gizliParola123"   // zorunlu, min 12 karakter
}
```

**Response `201`:**

```jsonc
{
  "success": true,
  "message": "Kayıt başarılı. Lütfen okul mailinize gelen onay linkine tıklayın.",
  "data": {
    "id": "<uuid>",
    "universityId": "<uuid>",       // e-posta domaininden otomatik bulundu
    "departmentId": null,
    "studentNumber": "250803999",
    "email": "ali@std.antalya.edu.tr",
    "firstName": "Ali",
    "lastName": "Veli",
    "photoUrl": null,
    "preferredLanguage": "tr",
    "status": "pending",            // mail onayı bekliyor
    "createdAt": "2026-07-07T...",
    "updatedAt": "2026-07-07T..."
  }
}
```

**Hata örnekleri (400):** `"Bu e-posta adresi sistemimizde kayıtlı bir üniversiteye ait değil."`, `"Bu e-posta adresi zaten kullanılıyor."`

### 4.2. `POST /api/auth/login`

**Request:**

```jsonc
{ "email": "ali@std.antalya.edu.tr", "password": "gizli123" }
```

**Response `200`** — dikkat, zarf farklı (`data` yok, kökte `user` + `token`):

```jsonc
{
  "success": true,
  "message": "Giriş başarılı.",
  "user": { /* 4.1'deki safe user objesiyle aynı alanlar */ },
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

`user` objesi **rol içermez** — login sonrası hemen `GET /api/users/me` çağırıp rolleri alın (bkz. §5.1, §7.1).

> **`user.mustChangePassword`**: Bir yönetici şifreyi sıfırladıysa `true` döner. Bu durumda kullanıcıyı zorunlu **şifre değiştirme** ekranına yönlendirin; `PATCH /api/users/me/password` ile yeni şifre belirlenince bayrak otomatik `false` olur. (Şifre sıfırlama yönetici tarafı: `docs/integration/moderation.md`.)

**Hatalar (401):** `"E-posta adresi veya şifre hatalı."` (e-posta/şifre ayrımı yapılmaz), askıya alınmış hesap reddedilir. (Mesajlar i18n — metne göre eşleştirmeyin.)

### 4.3. `GET /api/auth/verify?token=<uuid>`

Auth gerektirmez. Query'de `token` zorunludur.

**Response `200`:** `{ "success": true, "message": "E-posta adresiniz doğrulandı, hesabınız aktif." }`

**Hatalar (400):** `"Doğrulama token'ı eksik."`, `"Geçersiz doğrulama linki."`, `"Bu doğrulama linki zaten kullanılmış."`, `"Doğrulama linkinin süresi dolmuş. Lütfen tekrar kayıt olmayı deneyin."`

### 4.4. `GET /api/auth/me` (Bearer)

Token'ın hâlâ geçerli olup olmadığını hızlıca kontrol etmek için uygundur. **Minimal** döner:

```jsonc
{
  "success": true,
  "message": "Korumalı alana hoş geldiniz!",
  "data": { "userId": "<uuid>", "universityId": "<uuid>" }
}
```

Tam profil için `GET /api/users/me` kullanın.

### 4.5. Admin / Super Admin Atama — `PATCH /api/auth/users/:userId/...` (`role.manage`)

Dört rota da body almaz. Başarıda `200` + yalnızca `message` döner:

- `promote-admin` → `"Kullanıcı yönetici yapıldı."`
- `demote-admin` → `"Kullanıcının yöneticiliği kaldırıldı."`
- `promote-super-admin` → `"Kullanıcı sistem yöneticisi yapıldı."` (**dikkat:** hedef kullanıcıya tüm üniversiteler dahil tam yetki verir)
- `demote-super-admin` → `"Kullanıcının sistem yöneticiliği kaldırıldı."`

**Hatalar:** `404` `"Kullanıcı bulunamadı."`, `400` `"Bu kullanıcı zaten bu role sahip."`

Atama/kaldırma sonrası hedef kullanıcının yetki cache'i anında temizlenir — yeni yetkiler bir sonraki isteğinde geçerlidir. Ancak hedef kullanıcının **açık React oturumundaki state kendiliğinden güncellenmez**; kullanıcı sayfayı yenileyince/yeniden login olunca yeni rollerini görür.

### 4.6. Permission Yönetimi (`permission.manage`)

**`POST /api/auth/permissions`** — body: `{ "key": "string (3-100)", "description": "string (max 256, ops.)" }` → `201`, `data`: oluşturulan permission (`id`, `key`, `description`, timestamps). Hata: `"Bu yetki anahtarı zaten mevcut."`

**`GET /api/auth/permissions`** → `data`: permission dizisi.

**`PATCH /api/auth/permissions/:permissionId`** — body: `{ "description": "string (max 256)" }`. **`key` alanı bilinçli olarak güncellenemez** (koddaki yetki kontrolleri key'e sabit referans verir); formda key'i read-only gösterin.

### 4.7. Rol Yönetimi (`role.manage`)

**`POST /api/auth/roles`** — body:

```jsonc
{
  "name": "string (2-100)",
  "description": "string (max 256, ops.)",
  "universityId": "uuid | null (ops.)"  // null/verilmezse sistem geneli rol
}
```

**`GET /api/auth/roles`** → `data`: roller, her rolün `permissions` dizisiyle birlikte (yönetim panelinde rol-izin matrisi çizmek için yeterli).

**`PATCH /api/auth/roles/:roleId`** — body: `{ "name"?, "description"? }` (en az bir alan).

**`POST /api/auth/roles/:roleId/permissions`** — body: `{ "permissionId": "<uuid>" }` → `201` `"Yetki role eklendi."` Hata: `"Bu yetki zaten bu role atanmış."`

**`DELETE /api/auth/roles/:roleId/permissions/:permissionId`** → `"Yetki rolden kaldırıldı."`

Role permission eklendiğinde/kaldırıldığında **o role sahip tüm kullanıcıların** cache'i anında temizlenir.

---

## 5. Feature Referansı 2 — Users (`/api/users`)

Tamamen **self-service**: her rota yalnızca giriş yapmış kullanıcının kendi verisi üzerinde çalışır, hepsi Bearer ister. Başka kullanıcıları görüntüleme/yönetme admin feature'ının işidir (sonraki doküman).

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/users/me` | Tam profil (üniversite, bölüm ve **roller** dahil) |
| PATCH | `/api/users/me` | Profil güncelle |
| PATCH | `/api/users/me/password` | Şifre değiştir |
| GET | `/api/users/me/clubs` | Kulüp üyeliklerim (kulüp bilgisiyle) |
| GET | `/api/users/me/applications` | Kulüp kurma başvurularım |

### 5.1. `GET /api/users/me`

Frontend'in **oturum açılışında çağırması gereken ana endpoint** — global rolleri veren tek yer burasıdır.

```jsonc
{
  "success": true,
  "message": "Profil bulundu.",
  "data": {
    "id": "<uuid>",
    "universityId": "<uuid>",
    "departmentId": "<uuid> | null",
    "studentNumber": "250803001",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "photoUrl": null,
    "preferredLanguage": "tr",
    "status": "active",
    "createdAt": "...", "updatedAt": "...",

    "university": { "id": "...", "name": "Antalya Bilim Üniversitesi", "slug": "antalya-bilim", ... },
    "department": { "id": "...", "facultyId": "...", "name": "Bilgisayar Mühendisliği", ... } /* veya null */,
    "roles": [
      { "id": "...", "universityId": null, "name": "student", "description": "Öğrenci", ... }
    ]
  }
}
```

> `roles` yalnızca rol satırlarını içerir; permission listesi **içermez** (bkz. §3.4).

### 5.2. `PATCH /api/users/me`

Body (en az bir alan zorunlu):

```jsonc
{
  "firstName": "string (2-100, ops.)",
  "lastName": "string (2-100, ops.)",
  "photoUrl": "url (max 512, ops.)",       // dosya upload endpoint'i yok; hazır URL verilir
  "preferredLanguage": "tr | en | ... (2 karakter ISO 639-1, ops.)"
}
```

Response `data`: güncellenmiş safe user (ilişkiler olmadan, düz kolonlar).

> E-posta, öğrenci numarası ve bölüm buradan değiştirilemez (bölüm ataması admin feature'ındadır).

### 5.3. `PATCH /api/users/me/password`

```jsonc
{ "currentPassword": "eski", "newPassword": "yeni (min 12)" }
```

`200` `"Şifre güncellendi."` — Hata (400): `"Mevcut şifre yanlış."` Şifre değişince mevcut token'lar **geçersiz kılınmaz** (JWT stateless'tır); frontend isterse başarı sonrası yeniden login isteyebilir ama zorunlu değildir.

### 5.4. `GET /api/users/me/clubs`

`data`: kullanıcının `clubMembers` satırları, `club` objesi gömülü:

```jsonc
[
  {
    "clubId": "<uuid>",
    "userId": "<uuid>",
    "role": "president",        // member | officer | president  → Katman B rolü (bkz. §3.1)
    "status": "approved",       // pending | approved | rejected
    "createdAt": "...", "updatedAt": "...",
    "club": { "id": "...", "name": "Yazılım ve Teknoloji Kulübü", "slug": "...", "status": "approved", "joinPolicy": "open", ... }
  }
]
```

**Dikkat:** `status: "pending"` satırlar da gelir (onay bekleyen katılım istekleri). Kulüp içi yetki kararı verirken mutlaka `status === "approved"` filtresi uygulayın.

### 5.5. `GET /api/users/me/applications`

`data`: kullanıcının kulüp **kurma** başvuruları (üyelik istekleri değil):

```jsonc
[
  {
    "id": "<uuid>",
    "universityId": "<uuid>",
    "proposedName": "Satranç Kulübü",
    "description": "...",
    "applicantId": "<uuid>",
    "status": "pending",        // pending | approved | rejected
    "createdAt": "...", "updatedAt": "..."
  }
]
```

---

## 6. Feature Referansı 3 — University (`/api/universities`)

Okuma (GET) rotaları **tamamen public'tir** (auth gerektirmez) — kayıt/onboarding ekranlarında üniversite/fakülte/bölüm seçimi için tasarlandı. Yazma rotaları **granüler `university.*` permission'ları** ister. `university.create`/`delete` **platform** işidir (yalnızca `super_admin`); domain/fakülte/bölüm CRUD ve `university.update` **tenant-scoped**'tur (`super_admin` + `university_admin` + `academic_affairs`).

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/universities?search=` | — | Üniversiteleri listele (ops. isim araması, 1-256 karakter) |
| GET | `/api/universities/:universityId` | — | Tek üniversite (domainleriyle) |
| GET | `/api/universities/:universityId/faculties` | — | Üniversitenin fakülteleri |
| GET | `/api/universities/:universityId/faculties/:facultyId/departments` | — | Fakültenin bölümleri |
| POST | `/api/universities` | `university.create` | Üniversite oluştur (domainleriyle) — platform |
| PATCH | `/api/universities/:universityId` | `university.update` | Üniversite güncelle |
| DELETE | `/api/universities/:universityId` | `university.delete` | Üniversite sil — platform |
| POST | `/api/universities/:universityId/domains` | `university.domain.create` | Domain ekle |
| PATCH | `/api/universities/:universityId/domains/:domainId` | `university.domain.update` | Domain güncelle |
| DELETE | `/api/universities/:universityId/domains/:domainId` | `university.domain.delete` | Domain sil |
| POST/PATCH/DELETE | `/api/universities/:uid/faculties[/...]` | `university.faculty.{create,update,delete}` | Fakülte CRUD |
| POST/PATCH/DELETE | `/api/universities/:uid/faculties/:fid/departments[/...]` | `university.department.{create,update,delete}` | Bölüm CRUD |

**Önerilen kademeli seçim akışı:** üniversite → fakülte → bölüm. `departments` tablosunda `universityId` yoktur (bilinçli tasarım) — bölümler her zaman `facultyId` üzerinden çekilmelidir; "üniversitenin tüm bölümleri" diye bir endpoint yoktur.

Yazma rotalarının body şemaları (yönetim paneli için):

- `POST /` → `{ "name": "2-256", "slug": "2-256", "domains": [{ "domain": "3-256", "domainType": "student" | "staff" }] }` — en az 1 domain zorunlu.
- `PATCH /:universityId` → `{ "name"?, "slug"? }` (en az bir alan).
- `POST /:universityId/domains` → `{ "domain", "domainType" }`.
- `PATCH /:universityId/domains/:domainId` → `{ "domain"?, "domainType"? }` (en az bir alan).

> Domain ekleme/değiştirme kayıt akışını doğrudan etkiler (§2.2) — hangi e-postaların kaydolabileceğini bu tablo belirler.

---

## 7. React Tarafı İçin Öneriler

### 7.1. Oturum Başlatma Sırası

```
login → token'ı sakla
      → GET /api/users/me        → user + roles state'e yaz
      → GET /api/users/me/clubs  → clubMemberships state'e yaz
```

Sayfa yenilenince (token localStorage'da varsa) aynı iki isteği tekrar at; herhangi biri `401` dönerse token'ı silip `/login`'e yönlendir.

```ts
type AuthState = {
  token: string | null;
  user: SafeUser | null;                       // GET /api/users/me → data
  roleNames: string[];                          // data.roles.map(r => r.name)
  clubMemberships: {
    clubId: string;
    role: "member" | "officer" | "president";
    status: "pending" | "approved" | "rejected";
  }[];
};
```

### 7.2. Guard Yardımcıları

```ts
// KATMAN A — global (şimdilik rol adı bazlı, bkz. §3.4)
const hasRole = (name: string) => state.roleNames.includes(name);
const isAdmin = hasRole("admin") || hasRole("super_admin");
const isSuperAdmin = hasRole("super_admin");

// KATMAN B — kulüp içi (approved şart!)
const clubRoleOf = (clubId: string) =>
  state.clubMemberships.find(m => m.clubId === clubId && m.status === "approved")?.role ?? null;
```

Route seviyesinde: (1) token yoksa `/login`; (2) rol gerektiren sayfalarda `hasRole` kontrolü + 403 sayfası; (3) kulüp yönetim sayfalarında `clubRoleOf(clubId)`.

### 7.3. Altın Kural

Frontend guard'ları yalnızca **UX** içindir (buton gizleme, erken yönlendirme). Gerçek yetki kontrolü her istekte backend'de yapılır — bir butonu göstermek/gizlemek güvenlik sağlamaz, backend zaten `401/403` döner. Bu yüzden her API çağrısında `401/403`'ü merkezi bir interceptor'da ele alın; guard'ların "kaçırdığı" durumlar orada yakalanır.

### 7.4. Hata Gösterimi

`message` alanı isteğin diline göre döner ve kullanıcıya gösterilebilir — ayrı bir hata sözlüğü tutmanıza gerek yok. Doğrulama (400) hataları artık **standart zarf** içinde `code: "VALIDATION_ERROR"` + `details: [{ path, code, message }]` taşır (ham `ZodError` değil); form alanı bazlı hata için `details[].path`'i kullanın, istemiyorsanız genel bir "formu kontrol edin" mesajı yeterli.

---


## 8. Test Hesapları (Seed)

`bun run db:seed` sonrası tüm hesapların şifresi **`Password123!`**. Üniversite: Antalya Bilim Üniversitesi (domainler: `std.antalya.edu.tr` → student, `antalya.edu.tr` → staff).

| E-posta | Global rol | Durum / kulüp bağlamı |
|---|---|---|
| `superadmin@antalya.edu.tr` | `super_admin` | Tüm yetkiler, tenant scope bypass |
| `elif.demir@antalya.edu.tr` | `university_admin` | Yalnızca kendi üniversitesi (eski adı `admin`) |
| `ahmet.hoca@antalya.edu.tr` | `advisor` | Her iki kulübün danışmanı |
| `mustafa.kurt@std.antalya.edu.tr` | `student` | Yazılım Kulübü **president** |
| `can.ozturk@std.antalya.edu.tr` | `student` | Yazılım Kulübü **officer** |
| `ayse.yilmaz@std.antalya.edu.tr` | `student` | Fotoğrafçılık Kulübü **president** |
| `250803001@std.antalya.edu.tr` | `student` | Yazılım Kulübü üyesi; Fotoğrafçılık'ta pending istek |
| `deniz.kara@std.antalya.edu.tr` | `student` | `status: pending` (mail onayı bekliyor) |
| `fatma.sahin@std.antalya.edu.tr` | `student` | `status: suspended` (login reddedilir) |

---

## 9. Bilinen Kısıtlar

Frontend planlamasını etkileyen, backend tarafında bilinen konular:

1. **Etkin permission:** `GET /api/users/me/permissions`.
2. **Refresh token yok** — 7 günlük token dolunca yeniden login gerekir.
3. **`pending` kullanıcılar login olabilir** (§2.3) — engel bilinçli olarak sonraya bırakıldı; UI banner'la yönetmeli.
4. **E-posta gönderimi simüle** — dev'de doğrulama linki backend konsolunda.
5. **Dosya upload:** [media.md](media.md) — `POST /api/uploads`.
6. **Şifre değişimi mevcut token'ları geçersiz kılmaz** (JWT stateless).

