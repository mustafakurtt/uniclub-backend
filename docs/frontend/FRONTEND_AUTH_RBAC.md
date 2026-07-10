# University Club — Frontend Entegrasyon Dokümanı (v1)

**Kapsam:** Auth yapılanması, RBAC (yetkilendirme) yapılanması ve ilk 3 feature'ın tam endpoint referansı:

1. **Auth** — `/api/auth` (kayıt, giriş, e-posta doğrulama, rol/yetki yönetimi)
2. **Users** — `/api/users` (self-service profil işlemleri)
3. **University** — `/api/universities` (public üniversite/fakülte/bölüm listeleri)

Clubs, Admin, Announcements ve Gallery feature'ları bu dokümanın sonraki sürümlerinde eklenecektir.

> Bu doküman kod tabanından birebir doğrulanmıştır (Temmuz 2026). Backend'in tüm hata mesajları ve `message` alanları **Türkçedir** — UI'da doğrudan gösterilebilir.

> ⚠️ **GÜNCELLEME (Temmuz 2026 — v2 model):** Bu doküman **auth temeli + self-service** (kayıt, giriş, doğrulama, profil, public üniversite listeleri) için hâlâ geçerlidir. Ancak **rol/yetki modeli ve tüm yönetim endpoint'leri güncellendi:**
> - Roller artık **9** (4 değil): `admin` → **`university_admin`** olarak yeniden adlandırıldı; ayrıca `platform_support`, `student_affairs`, `academic_affairs`, `content_moderator`, `auditor` eklendi.
> - Yetkiler granülerleşti (okuma/yazma ayrı: `user.view`/`user.manage`, `club.view`/`club.update`, `application.view`, `club.member.manage`, `announcement.moderate`, `gallery.moderate`, `university.*`).
> - **Effective yetki endpoint'i artık VAR:** `GET /api/users/me/permissions`.
> - Askıya alma **anında** erişimi keser.
>
> **Yönetim (admin/RBAC) tarafının güncel ve tam referansı için:** [FRONTEND_YONETIM.md](FRONTEND_YONETIM.md). Aşağıdaki §3.1/§3.5/§8'deki 4-rollük ve 6-yetkilik listeler **eskidir** — güncel model için o dokümanı esas alın.

---

## İçindekiler

- [1. Genel Kurallar](#1-genel-kurallar)
- [2. Auth Yapılanması](#2-auth-yapılanması)
- [3. RBAC Yapılanması](#3-rbac-yapılanması)
- [4. Feature Referansı 1 — Auth (`/api/auth`)](#4-feature-referansı-1--auth-apiauth)
- [5. Feature Referansı 2 — Users (`/api/users`)](#5-feature-referansı-2--users-apiusers)
- [6. Feature Referansı 3 — University (`/api/universities`)](#6-feature-referansı-3--university-apiuniversities)
- [7. React Tarafı İçin Öneriler](#7-react-tarafı-için-öneriler)
- [8. Enum Referansı](#8-enum-referansı)
- [9. Test Hesapları (Seed)](#9-test-hesapları-seed)
- [10. Bilinen Kısıtlar / Backend'e Notlar](#10-bilinen-kısıtlar--backende-notlar)

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
{
  "success": true,            // işlem sonucu
  "message": "Türkçe mesaj",  // kullanıcıya gösterilebilir
  "data": { ... }             // asıl veri (her endpoint'te olmayabilir)
}
```

**Tek istisna:** `POST /api/auth/login` — `data` yerine kökte `user` ve `token` alanlarını döner (bkz. §4.2).

### HTTP Status Kodları

| Status | Anlamı | Frontend davranışı |
|---|---|---|
| `200` | Başarılı | — |
| `201` | Kayıt oluşturuldu (POST) | — |
| `400` | Validasyon hatası veya iş kuralı ihlali | `message`'ı formda/toast'ta göster |
| `401` | Token yok / geçersiz / süresi dolmuş | Token'ı sil, `/login`'e yönlendir |
| `403` | Kimlik doğru ama **yetki yok** (permission veya tenant scope) | `message`'ı göster; ilgili ekranı gizle |
| `404` | Kaynak bulunamadı (backend, mesajda "bulunamadı" geçiyorsa 404 döner) | "Bulunamadı" ekranı |

Zod validasyon hataları `zValidator` tarafından `400` ile döner; bu durumda gövde standart zarf yerine zod'un hata formatındadır (`error.issues[].message` alanları Türkçedir).

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

## 3. RBAC Yapılanması

### 3.1. İki Bağımsız Yetki Katmanı

Sistemde birbirinden **tamamen bağımsız** iki yetki katmanı vardır; frontend'de de ayrı ayrı ele alınmalıdır:

```
┌────────────────────────────────────────────────────────────┐
│ KATMAN A — Global RBAC (üniversite/sistem geneli)          │
│                                                            │
│   Roller     : super_admin, platform_support,              │
│                university_admin, student_affairs,          │
│                academic_affairs, content_moderator,        │
│                auditor, advisor, student   (9 rol)         │
│   Permission : granüler resource.action —                  │
│                user.view/manage, club.view/approve/…,      │
│                announcement.moderate, university.*,        │
│                role.manage, permission.manage              │
│   Kaynak     : userRoles + rolePermissions                 │
│                + userPermissions (kişiye özel override)    │
│   Kullanım   : /api/auth'un yönetim rotaları,              │
│                /api/universities'in yazma rotaları,        │
│                /api/admin/* (sonraki dokümanda)            │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ KATMAN B — Kulüp içi roller (her kulüpte ayrı)             │
│                                                            │
│   Roller  : member, officer, president                     │
│   Kaynak  : clubMembers.role (üyelik status: approved)     │
│   Kullanım: /api/clubs/* (sonraki dokümanda)               │
└────────────────────────────────────────────────────────────┘
```

Bir kullanıcı aynı anda global `student` + bir kulüpte `president` olabilir. Bu iki bilgi birbirinden türetilemez.

### 3.2. Global Katmanın Çalışma Şekli

- Kullanıcı **birden fazla role** sahip olabilir (`userRoles`).
- Roller permission taşır (`rolePermissions`). Backend her korumalı istekte kullanıcının **etkin (effective) permission setini** hesaplar: rollerinden gelen tüm permission'lar + kişiye özel `userPermissions` kayıtları. `userPermissions.granted: false` olan bir kayıt, rolden gelen o permission'ı **iptal eder** (override).
- Yetki kontrolü **rol adına değil permission key'ine** bakar. Örn. bir endpoint `admin` rolünü değil `user.manage` permission'ını arar. Rollerin permission listesi runtime'da değiştirilebildiği için frontend'de "admin ise şunu göster" yerine mümkünse permission bazlı düşünün (mevcut kısıt için bkz. §3.4).
- Permission ve roller **kapalı bir liste değildir** — `role.manage`/`permission.manage` yetkisine sahip biri runtime'da yeni rol/permission tanımlayabilir. Seed'le gelen 9 rol ve granüler permission kataloğu başlangıç durumudur (güncel liste: FRONTEND_YONETIM §2/§3).

### 3.3. Guard Zinciri ve Tenant Scope

Korumalı her endpoint backend'de şu zincirden geçer:

```
authMiddleware → attachAuthz → requirePermission("<key>") [→ enforceTenantScope()]
```

1. **authMiddleware** — Bearer token doğrulanır; yoksa/geçersizse `401`.
2. **attachAuthz** — kullanıcının etkin rol+permission'ları çözülür. Bu hesap **Redis'te 5 dakika cache'lenir**; rol/izin değiştiren endpoint'ler ilgili kullanıcıların cache'ini anında temizler (yani promote/demote ve role permission ekleme/çıkarma işlemleri **hemen** etkili olur).
3. **requirePermission** — permission yoksa `403` + `"Bu işlem için yetkiniz bulunmamaktadır."`
4. **enforceTenantScope** (yalnızca path'inde `:universityId` olan yönetim rotalarında) — path'teki üniversite, kullanıcının kendi `universityId`'siyle eşleşmiyorsa `403` + `"Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır."` **İstisna: `super_admin` ve `platform_support` rolleri bu kontrolü bypass eder** — herhangi bir üniversiteyi hedefleyebilir (`platform_support` yalnızca okuma). Frontend'de bu rollere üniversite seçici koyulabilir; `university_admin` ve diğer tenant rolleri yalnızca kendi üniversitesini yönetir.

### 3.4. Frontend Rol/İzin Bilgisine Nereden Ulaşır?

| Bilgi | Kaynak | Durum |
|---|---|---|
| `userId`, `universityId` | JWT payload + `GET /api/auth/me` | ✅ Var |
| Global **rol adları** (`["student"]`, `["admin"]`…) | `GET /api/users/me` → `data.roles[].name` | ✅ Var |
| Global **etkin permission listesi** (`["user.view", ...]`, override'lar uygulanmış) | `GET /api/users/me/permissions` → `data.permissions` | ✅ **Var (yeni)** |
| Kulüp içi rol | `GET /api/users/me/clubs` → her satırda `role`, `status` | ✅ Var |

**Pratik sonuç (GÜNCEL):** Etkin permission listesi artık `GET /api/users/me/permissions` ile dışarı veriliyor (`{ roles, permissions, status }`). UI göster/gizle kararlarını **rol adı yerine permission'a** göre verin — `permissions.includes("<key>")`. Tenant seçici gibi az sayıda karar için `roles`'e bakılır (`super_admin`/`platform_support` → çapraz-tenant). Detaylı guard stratejisi ve panel görünürlük matrisi için [FRONTEND_YONETIM.md §4/§7](FRONTEND_YONETIM.md).

### 3.5. Seed'e Göre Rol → Permission Matrisi

> ⚠️ **ESKİ (4-rollük model).** Güncel **9-rollük** matris için
> [FRONTEND_YONETIM.md §3](FRONTEND_YONETIM.md). Aşağıdaki tablo yalnızca tarihsel
> referanstır; `admin` artık `university_admin` ve yetkiler granülerdir.

| Global rol | Permission'ları | Not |
|---|---|---|
| `student` | (yok) | `student` domain'li e-postayla kayıtta otomatik atanır |
| `advisor` | (yok) | `staff` domain'li e-postayla kayıtta otomatik atanır; kulüp danışmanlığı ayrı bir ilişkidir, bu role bağlı değildir |
| `admin` | `user.manage`, `club.approve`, `club.manage` | Kendi üniversitesiyle sınırlı (tenant scope) |
| `super_admin` | 6 permission'ın tamamı | Tenant scope bypass |

> Bu matris başlangıç durumudur ve runtime'da değişebilir — frontend'de **hardcode edilmemeli**, yalnızca geçici rol-adı-bazlı guard'da (§3.4) referans olarak kullanılmalıdır.

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
  "password": "gizli123"         // zorunlu, min 6 karakter
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

**Hatalar (401):** `"E-posta adresi veya şifre hatalı."` (e-posta/şifre ayrımı yapılmaz), `"Hesabınız askıya alınmıştır. Lütfen SKS birimiyle iletişime geçin."`

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
{ "currentPassword": "eski", "newPassword": "yeni (min 6)" }
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

`message` alanı her zaman Türkçe ve kullanıcıya gösterilebilir niteliktedir — ayrıca bir hata sözlüğü tutmanıza gerek yok. Yalnızca zod validasyon hatalarının (400) gövde formatı farklıdır; form alanı bazlı hata göstermek isterseniz zod issue formatını parse edin, istemiyorsanız genel bir "formu kontrol edin" mesajı yeterli.

---

## 8. Enum Referansı

| Enum | Değerler | Kullanıldığı yer |
|---|---|---|
| `user.status` | `pending`, `active`, `suspended` | Kullanıcı hesap durumu |
| `domain_type` | `student`, `staff` | Kayıt anındaki otomatik rol ataması (§2.2) |
| `club_role` (Katman B) | `member`, `officer`, `president` | `clubMembers.role` |
| `membership_status` | `pending`, `approved`, `rejected` | `clubMembers.status` |
| `application_status` | `pending`, `approved`, `rejected` | Kulüp kurma başvuruları |
| `club.status` | `pending`, `approved`, `rejected`, `archived` | Kulüp durumu |
| `join_policy` | `open`, `approval_required` | Kulübe katılım politikası |
| Global roller (seed) | `student`, `advisor`, `university_admin`, `super_admin`, `platform_support`, `student_affairs`, `academic_affairs`, `content_moderator`, `auditor` | Katman A (bkz. FRONTEND_YONETIM §2) |
| Global permission'lar (seed) | granüler `resource.action`: `user.view`/`user.manage`, `club.view`/`club.approve`/`club.update`/`club.advisor.manage`/`club.member.manage`/`club.delete`, `application.view`, `announcement.moderate`, `gallery.moderate`, `university.*`, `role.manage`, `permission.manage` | Katman A (tam liste: FRONTEND_YONETIM §3) |

---

## 9. Test Hesapları (Seed)

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

## 10. Bilinen Kısıtlar / Backend'e Notlar

Frontend planlamasını etkileyen, backend tarafında bilinen konular:

1. ~~**Etkin permission endpoint'i yok**~~ — ✅ **ÇÖZÜLDÜ:** `GET /api/users/me/permissions` (`{ roles, permissions, status }`) eklendi. UI artık permission bazlı guard yapabilir (§3.4).
2. **Refresh token yok** — 7 günlük token dolunca yeniden login gerekir.
3. **`pending` kullanıcılar login olabilir** (§2.3) — engel bilinçli olarak sonraya bırakıldı; UI banner'la yönetmeli.
4. **E-posta gönderimi simüle** — dev'de doğrulama linki backend konsolunda.
5. **Dosya upload endpoint'i yok** — `photoUrl` (ve ileride kulüp görselleri) düz URL string alır; upload çözümü (S3/Cloudinary vb.) ayrıca kararlaştırılacak.
6. **Şifre değişimi mevcut token'ları geçersiz kılmaz** (JWT stateless).

---

**Sonraki doküman sürümünde eklenecekler:** Clubs (`/api/clubs` — üyelik, katılım istekleri, iletişim linkleri), Announcements & Gallery (kulüp alt-kaynakları) ve Admin (`/api/admin` — kullanıcı/kulüp/başvuru yönetimi).
