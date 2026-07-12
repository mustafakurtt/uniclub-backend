# Frontend — Yönetim Paneli Entegrasyon Dokümanı (v2)

**Kapsam:** Yönetim (admin/sistem) tarafının **tam** endpoint referansı — kullanıcı
yönetimi, kulüp/başvuru/danışman yönetimi, içerik moderasyonu, rol yönetimi,
yetki (claim) yönetimi ve kişi bazlı yetki override'ları. Kurumsal **9 rollük**
RBAC modeline göre yazıldı.

> Kod tabanından birebir doğrulanmış (Temmuz 2026). Mesajlar **isteğin diline**
> göre döner (`Accept-Language: tr|en`, varsayılan `tr`) ve UI'da doğrudan
> gösterilebilir; kalıcı mantık için mesaj metnine değil `code`/HTTP status'a
> bakın (bkz. `docs/DENETIM_VE_HATA.md`). Tasarım gerekçeleri için:
> [docs/yonetim/](yonetim/) (özellikle `06-rol-mimarisi-yeniden-tasarim.md`).
> Auth/kayıt/self-service temeli için: [FRONTEND_AUTH_RBAC.md](FRONTEND_AUTH_RBAC.md)
> (dikkat: o doküman eski 4-rollük modele göre yazıldı; roller/permission'lar için
> bu doküman esas alınmalıdır).

> 🚨 **KIRICI DEĞİŞİKLİKLER — önce bunu okuyun:**
> [FRONTEND_RUTBE_VE_PLATFORM.md](FRONTEND_RUTBE_VE_PLATFORM.md)
>
> - `universityId` artık **`string | null`** olabilir (tenant'sız platform hesapları).
> - Rollere **`rank`** (yetki derecesi) eklendi; `me/permissions` artık **`maxRank`** döner.
> - Yeni **`GET /api/admin/universities`** — akademik/yönetim ekranları public
>   `GET /api/universities` yerine bunu çağırmalı.
> - Rütbe/hiyerarşi ihlalleri **400** döner (403 değil).
> - Seed hesapları değişti: `superadmin@antalya.edu.tr` → **`superadmin@platform.local`**.

---

## İçindekiler

- [1. Genel Kurallar](#1-genel-kurallar)
- [2. Rol Modeli (9 rol)](#2-rol-modeli-9-rol)
- [3. Yetki (Permission) Kataloğu](#3-yetki-permission-kataloğu)
- [4. UI Guard Stratejisi — Effective Permission](#4-ui-guard-stratejisi--effective-permission)
- [5. Okul Yönetim Paneli (`/api/admin`)](#5-okul-yönetim-paneli-apiadmin)
- [6. Sistem / RBAC Yönetimi (`/api/auth`)](#6-sistem--rbac-yönetimi-apiauth)
- [7. Panel Görünürlük Matrisi](#7-panel-görünürlük-matrisi)
- [8. React Önerileri](#8-react-önerileri)
- [9. Enum Referansı](#9-enum-referansı)
- [10. Test Hesapları](#10-test-hesapları)

---

## 1. Genel Kurallar

**Base URL:** `http://localhost:3000` (dev). Tüm route'lar `/api` altında.

**Response zarfı:** her endpoint `{ success, message, data? }` döner. Hata
durumunda `{ success: false, message }`.

**HTTP durumları:**

| Status | Anlam | Frontend |
|---|---|---|
| 200 / 201 | Başarılı | — |
| 400 | Validasyon / iş kuralı ihlali | `message`'ı göster |
| 401 | Token yok/geçersiz | Token sil, `/login` |
| 403 | Yetki yok (permission / tenant scope / **askıya alınmış**) | `message`'ı göster, ilgili aksiyonu gizle |
| 404 | Kaynak yok (`message`'da "bulunamadı") | "Bulunamadı" |

**Auth header:** korumalı her istekte `Authorization: Bearer <token>`.

**Tenant scope:** `/api/admin/universities/:universityId/...` rotalarında path'teki
üniversite, çağıranın kendi üniversitesiyle eşleşmeli. **`super_admin`** ve
**`platform_support`** bu kontrolü **bypass eder** (herhangi bir üniversiteyi
hedefler). Diğer roller yalnızca kendi `universityId`'lerini kullanabilir; aksi
halde `403`.

**Anlık askı (ÖNEMLİ — yeni davranış):** Bir kullanıcı `suspended` yapıldığında
mevcut token'ı **anında** geçersizleşir (RBAC cache invalidation). Bir sonraki
her istekte `403` + `"Hesabınız askıya alınmıştır. Lütfen SKS birimiyle iletişime
geçin."` döner. Frontend bu 403'ü merkezi interceptor'da yakalayıp oturumu
sonlandırmalıdır.

---

## 2. Rol Modeli (9 rol)

Roller `roles` tablosunda; **kapalı liste değildir** (`role.manage` ile runtime'da
eklenebilir). Seed ile gelen kurumsal set:

| Rol | Kapsam | Karşılığı | Özet yetki |
|---|---|---|---|
| `super_admin` | Platform | SaaS operatörü | Her şey (tüm tenant + platform) |
| `platform_support` | Platform (salt-okunur) | Destek | Çapraz-tenant **okuma** (`*.view`), yazma yok |
| `university_admin` | Tenant | Rektörlük/Genel Yönetim | Kendi tenant'ının tamamı + moderasyon + (tenant) rol yönetimi |
| `student_affairs` | Tenant | SKS / Kulüp Koordinatörlüğü | Kulüp onay/güncelle/danışman/üye + moderasyon |
| `academic_affairs` | Tenant | Öğrenci İşleri / BİDB | Fakülte/bölüm/domain + bölüm atama |
| `content_moderator` | Tenant | İçerik moderatörü | Duyuru/galeri moderasyonu |
| `auditor` | Tenant (salt-okunur) | Denetim/İzleme | Kendi tenant `*.view` |
| `advisor` | — | Danışman hoca | RBAC yetkisi yok; kulüp danışmanı atanabilme etiketi |
| `student` | — | Öğrenci | RBAC yetkisi yok; kulüp güçleri kulüp katmanından |

> **`admin` rolü artık `university_admin`** olarak adlandırılır. `promote-admin`
> endpoint'i bu role atar (URL geriye dönük uyumluluk için aynı kaldı).

**İki katman ayrımı korunur:** Bu doküman **global RBAC (Katman A)** ile ilgilenir.
Kulüp-içi roller (member/officer/president — Katman B) ayrı bir sistemdir ve
kulüp yönetim ekranlarının konusudur (bkz. clubs dokümanı).

---

## 3. Yetki (Permission) Kataloğu

Seed ile gelen anahtarlar. **DB asıl kaynaktır** (runtime'da eklenebilir).

| key | Açıklama | Tür |
|---|---|---|
| `user.view` | Kullanıcıları görüntüleme (salt-okunur) | Tenant |
| `user.manage` | Kullanıcı durumu (askı) + bölüm | Tenant |
| `club.view` | Kulüpleri görüntüleme (tüm durumlar) | Tenant |
| `application.view` | Başvuruları görüntüleme | Tenant |
| `club.approve` | Başvuru onay/red | Tenant |
| `club.update` | Kulüp durum + profil | Tenant |
| `club.advisor.manage` | Danışman ata/kaldır | Tenant |
| `club.member.manage` | Üye çıkarma/rol düzeltme (herhangi kulüp) | Tenant |
| `club.delete` | Kulüp silme | Tenant |
| `announcement.moderate` | Herhangi kulübün duyurusunu kaldır | Tenant |
| `gallery.moderate` | Herhangi kulübün görselini kaldır | Tenant |
| `university.update` | Üniversite profili | Tenant |
| `university.domain.{create,update,delete}` | E-posta domainleri | Tenant |
| `university.faculty.{create,update,delete}` | Fakülteler | Tenant |
| `university.department.{create,update,delete}` | Bölümler | Tenant |
| `university.create` / `university.delete` | Üniversite oluştur/sil | **Platform** |
| `role.manage` | Rol yönetimi + rol atama | Tenant* |
| `permission.manage` | Yetki kataloğu + kişisel claim override | **Platform** |

\* `role.manage`: `super_admin` global; `university_admin` **kendi tenant'ıyla
sınırlı** (aşağıda §6). `permission.manage` yalnızca `super_admin`'dedir.

**Rol → yetki demeti (seed başlangıcı):**

| Yetki | super_admin | platform_support | university_admin | student_affairs | academic_affairs | content_moderator | auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| user.view | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| user.manage | ✅ | — | ✅ | — | ✅ | — | — |
| club.view / application.view | ✅ | ✅ | ✅ | ✅ | — | ✅¹ | ✅ |
| club.approve | ✅ | — | ✅ | ✅ | — | — | — |
| club.update | ✅ | — | ✅ | ✅ | — | — | — |
| club.advisor.manage | ✅ | — | ✅ | ✅ | — | — | — |
| club.member.manage | ✅ | — | ✅ | ✅ | — | — | — |
| club.delete | ✅ | — | ✅ | — | — | — | — |
| announcement/gallery.moderate | ✅ | — | ✅ | ✅ | — | ✅ | — |
| university.faculty/department/domain.* | ✅ | — | ✅ | — | ✅ | — | — |
| university.update | ✅ | — | ✅ | — | — | — | — |
| role.manage | ✅ | — | ✅ | — | — | — | — |
| permission.manage / university.create/delete | ✅ | — | — | — | — | — | — |

¹ `content_moderator` yalnızca `club.view` taşır (application.view taşımaz).

> Bu matris **runtime'da değişebilir** — UI'da hardcode etmeyin, effective
> permission'a bakın (§4).

---

## 4. UI Guard Stratejisi — Effective Permission

Artık **effective (etkin) yetki listesi dışa veriliyor.** UI göster/gizle
kararlarını rol adına değil **permission'a** göre verin.

### `GET /api/users/me/permissions` (Bearer)

Oturum açılışında çağrılacak ana guard kaynağı.

```jsonc
{
  "success": true,
  "message": "Etkin yetkiler listelendi.",
  "data": {
    "roles": ["university_admin"],
    "permissions": ["user.view","user.manage","club.view","club.approve", ...],
    "status": "active"        // pending | active | suspended
  }
}
```

- `permissions`: rollerden gelen + kişisel override uygulanmış **nihai** set.
- `roles`: rol adları (rozet/etiket göstermek için).
- `status`: hesap durumu.

**Kural:** Bir aksiyonu/menüyü göstermek için `permissions.includes("<key>")`
kontrolü yapın. Tenant seçici (super_admin/platform_support için) `roles`'e bakar.

Bir yöneticinin **başka** kullanıcının effective yetkilerini görmesi için:
`GET /api/admin/universities/:universityId/users/:userId/effective-permissions`
(`user.view`) — aynı `{ roles, permissions, status }` şeklinde.

---

## 5. Okul Yönetim Paneli (`/api/admin`)

Hepsi tenant-scoped (`:universityId`). `super_admin`/`platform_support` her
tenant'ı hedefler; diğerleri yalnızca kendi tenant'ını.

### 5.1. Kullanıcılar

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/universities/:uid/users?status=&role=` | `user.view` | Liste (filtreli). Her satırda `roles` gömülü |
| GET | `/universities/:uid/users/:userId` | `user.view` | Zenginleştirilmiş detay (aşağıda) |
| GET | `/universities/:uid/users/:userId/effective-permissions` | `user.view` | `{ roles, permissions, status }` |
| PATCH | `/universities/:uid/users/:userId/department` | `user.manage` | `{ departmentId: "<uuid>" \| null }` |

> ⚠️ **Kullanıcı durumu (ban/unban), şifre sıfırlama ve aktivite artık `/api/moderation` altında** — eski `PATCH .../users/:userId/status` **kaldırıldı**. Sebepli ban, moderasyon geçmişi ve şifre sıfırlama için bkz. `docs/frontend/FRONTEND_MODERASYON.md`.

- **Liste filtreleri:** `?status=` (pending/active/suspended), `?role=` (örn.
  `?role=advisor`). İkisi birlikte kullanılabilir.
- **Detay `data` şekli:**

```jsonc
{
  "id":"...", "universityId":"...", "departmentId":"...", "email":"...",
  "firstName":"...", "lastName":"...", "status":"active", /* ...safe user */
  "roles": [ { "id":"...", "name":"university_admin", "description":"...", "universityId":null } ],
  "clubMemberships": [ { "clubId":"...", "userId":"...", "role":"president", "status":"approved", "club": { "id":"...", "name":"...", "slug":"...", "status":"approved" } } ],
  "permissionOverrides": [ { "userId":"...", "permissionId":"...", "granted": false, "permission": { "key":"club.delete", ... } } ],
  "effectivePermissions": [ "user.view", "club.approve", ... ]
}
```

- **Durum kuralları (artık moderation'da):** ban/unban `/api/moderation/.../ban|unban`
  ile yapılır (sebep zorunlu, geçmiş tutulur). `suspended` → hedefin oturumu **anında**
  kesilir (§1). Kendini banlama engellidir (`400 moderation.cannotModerateSelf`);
  zaten askıdaysa `400 moderation.alreadyBanned`. Bkz. `FRONTEND_MODERASYON.md`.
- **Bölüm doğrulaması:** hedef bölüm başka tenant'a aitse
  `400 "Bölüm bu üniversiteye ait değil."` (fakülte→üniversite zinciri).
- Kullanıcı **silme yoktur** (kasıtlı, FK ağı) → askıya alın.

### 5.2. Kulüp Başvuruları

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/universities/:uid/club-applications?status=` | `application.view` | Başvuru listesi (`applicant` gömülü) |
| PATCH | `/universities/:uid/club-applications/:id/approve` | `club.approve` | Onayla → **gerçek kulüp oluşur**, başvuran başkan olur |
| PATCH | `/universities/:uid/club-applications/:id/reject` | `club.approve` | Reddet |

Onay `data`: `{ application, club }`. Zaten değerlendirilmişse
`400 "Bu başvuru zaten değerlendirilmiş."`

### 5.3. Kulüpler

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/universities/:uid/clubs?status=` | `club.view` | Tüm durumlar (pending/approved/rejected/archived) |
| PATCH | `/universities/:uid/clubs/:clubId/status` | `club.update` | `{ status }` |
| PATCH | `/universities/:uid/clubs/:clubId` | `club.update` | `{ name?, description?, logoUrl?, coverUrl?, joinPolicy? }` |
| DELETE | `/universities/:uid/clubs/:clubId` | `club.delete` | Kalıcı silme — **önce archived/rejected olmalı** |

Silme kuralı: aktif/pending kulüp doğrudan silinemez →
`400 "Yalnızca arşivlenmiş veya reddedilmiş kulüpler silinebilir..."`. Silme,
bağlı içeriği (üye/danışman/link/duyuru/galeri) tek transaction'da temizler.

### 5.4. Danışmanlar

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/universities/:uid/clubs/:clubId/advisors` | `club.view` | Danışman listesi (`user` gömülü) |
| POST | `/universities/:uid/clubs/:clubId/advisors` | `club.advisor.manage` | `{ userId }` |
| DELETE | `/universities/:uid/clubs/:clubId/advisors/:userId` | `club.advisor.manage` | Kaldır |

Danışman adayı **`advisor` rolünde** olmalı, aksi halde
`400 "Danışman olarak yalnızca 'advisor' rolündeki personel atanabilir."` ve aynı
tenant'ta olmalı.

### 5.5. Üyeler & İçerik Moderasyonu (tenant override)

Kulüp-içi katman (officer/president/advisor) korunur; bunlar tenant yöneticisinin
**herhangi bir kulüpte** kullanabildiği override'lardır.

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| GET | `/universities/:uid/clubs/:clubId/members` | `club.view` | Üye listesi (bekleyenler dahil, `user` gömülü) |
| DELETE | `/universities/:uid/clubs/:clubId/members/:userId` | `club.member.manage` | Üyeyi çıkar |
| DELETE | `/universities/:uid/clubs/:clubId/announcements/:announcementId` | `announcement.moderate` | Duyuruyu kaldır |
| DELETE | `/universities/:uid/clubs/:clubId/gallery/:imageId` | `gallery.moderate` | Görseli kaldır |

Çapraz-kulüp koruması: içerik gerçekten o kulübe ait değilse `404`.
(Duyuru/galeri **listesini** okumak için kulüp public alt-kaynak endpoint'leri
kullanılır: `GET /api/clubs/:clubId/announcements|gallery`.)

---

## 6. Sistem / RBAC Yönetimi (`/api/auth`)

**Tenant scope path'te değildir** — kapsam serviste aktör rolüne göre uygulanır:
- `super_admin`: sınırsız (global roller + tüm tenant'lar).
- `university_admin` (`role.manage` taşır): **yalnızca kendi tenant'ının**
  rolleri; global şablonları düzenleyemez ama atayabilir (platform rolleri hariç).

### 6.1. Rol atama (kullanıcıya) — `role.manage`

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/auth/users/:userId/roles` | Kullanıcının rolleri |
| POST | `/api/auth/users/:userId/roles` | `{ roleId }` — rol ata |
| DELETE | `/api/auth/users/:userId/roles/:roleId` | Rol kaldır |
| PATCH | `/api/auth/users/:userId/promote-admin` | `university_admin` yap |
| PATCH | `/api/auth/users/:userId/demote-admin` | `university_admin` kaldır |
| PATCH | `/api/auth/users/:userId/promote-super-admin` | `super_admin` yap (**yalnızca super_admin çağırabilir**) |
| PATCH | `/api/auth/users/:userId/demote-super-admin` | `super_admin` kaldır |

**Tenant/escalation kuralları (university_admin için):**
- Hedef kullanıcı **kendi tenant'ında** olmalı → aksi `400 "Bu kullanıcı üzerinde işlem yetkiniz yok."`
- **Platform rolleri** (`super_admin`, `platform_support`) atanamaz →
  `400 "Bu rol yalnızca sistem yöneticisi tarafından atanabilir."`
- Başka tenant'ın özel rolü atanamaz → `400 "Bu rol bu üniversiteye ait değil."`
- Zaten sahipse `400 "Bu kullanıcı zaten bu role sahip."`
- **Son super_admin** düşürülemez → `400 "Sistemdeki son sistem yöneticisi görevden alınamaz."`

> Yani `promote-super-admin`'i UI'da **yalnızca `super_admin`** rolüne göster;
> `university_admin` çağırırsa `400` alır.

### 6.2. Rol kataloğu — `role.manage`

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/auth/roles` | Roller + her rolün `permissions`'ı (university_admin: global + kendi tenant) |
| POST | `/api/auth/roles` | `{ name, description?, universityId? }` — tenant admin'de `universityId` **zorla kendi tenant'ına** çekilir |
| PATCH | `/api/auth/roles/:roleId` | `{ name?, description? }` |
| DELETE | `/api/auth/roles/:roleId` | Rol sil (bağlar temizlenir) |
| GET | `/api/auth/roles/:roleId/users` | Role sahip kullanıcılar |
| POST | `/api/auth/roles/:roleId/permissions` | `{ permissionId }` — role yetki ekle |
| DELETE | `/api/auth/roles/:roleId/permissions/:permissionId` | Rolden yetki kaldır |

**Kurallar:**
- Çekirdek rol adı değiştirilemez / çekirdek rol silinemez →
  `400 "Sistem rolünün adı değiştirilemez." / "Sistem rolü silinemez."`
  (çekirdek: student, advisor, university_admin, super_admin, platform_support).
- university_admin **global rol** üzerinde işlem yapamaz →
  `400 "Bu rol üzerinde işlem yetkiniz yok (yalnızca kendi üniversitenizin rollerini yönetebilirsiniz)."`
- university_admin bir tenant rolüne **platform yetkisi** ekleyemez
  (`university.create/delete`, `role.manage`, `permission.manage`) →
  `400 "Bu yetki platform seviyesidir; tenant rollerine atanamaz."`
- Rol/yetki değişimi o role sahip **tüm kullanıcıların** cache'ini anında temizler.

### 6.3. Yetki (permission) kataloğu — `permission.manage` (yalnızca super_admin)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/auth/permissions` | Tüm permission satırları |
| POST | `/api/auth/permissions` | `{ key, description? }` |
| PATCH | `/api/auth/permissions/:permissionId` | `{ description }` — **`key` değişmez** |
| DELETE | `/api/auth/permissions/:permissionId` | Sil (seed çekirdeği silinemez → `400`) |
| GET | `/api/auth/permissions/:permissionId/roles` | Yetkiyi taşıyan roller |

### 6.4. Kişi bazlı yetki override (claim) — `permission.manage` (yalnızca super_admin)

Bir kullanıcıya rolünden bağımsız yetki **ver** veya rolünden geleni **iptal et**.

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/auth/users/:userId/permissions` | Kişisel override listesi (`permission` gömülü, `granted` alanıyla) |
| POST | `/api/auth/users/:userId/permissions` | `{ permissionId? \| key?, granted: boolean }` (upsert) |
| DELETE | `/api/auth/users/:userId/permissions/:permissionId` | Override'ı kaldır (yetki tekrar role göre belirlenir) |

- `granted: true` → yetkiyi **ekle**; `granted: false` → rolden geleni **iptal et**
  (kişisel override rolü ezer).
- Değişiklik hedef kullanıcının effective set'ine **anında** yansır.

---

## 7. Panel Görünürlük Matrisi

Frontend, effective `permissions`'a göre şu bölümleri göster/gizle:

| Bölüm / Aksiyon | Gerekli permission |
|---|---|
| **Kullanıcılar** sekmesi (liste/detay) | `user.view` |
| Kullanıcı durum/bölüm değiştir | `user.manage` |
| **Kulüpler** sekmesi | `club.view` |
| Kulüp durum/profil düzenle | `club.update` |
| Kulüp sil | `club.delete` |
| **Başvurular** sekmesi | `application.view` |
| Başvuru onayla/reddet | `club.approve` |
| Danışman ata/kaldır | `club.advisor.manage` |
| Üye çıkar | `club.member.manage` |
| Duyuru/galeri kaldır (moderasyon) | `announcement.moderate` / `gallery.moderate` |
| **Akademik yapı** (fakülte/bölüm/domain) | `university.faculty.*` / `university.department.*` / `university.domain.*` |
| **Roller** sekmesi | `role.manage` |
| **Yetkiler / Kişisel claim** sekmesi | `permission.manage` |
| Kullanıcıyı super_admin yap | `role.manage` **ve** rol=`super_admin` |
| **Tenant seçici** (çapraz-tenant) | rol ∈ {`super_admin`, `platform_support`} |

> Altın kural: guard'lar yalnızca UX içindir. Gerçek kontrol backend'de; her
> istekte `403`'ü merkezi interceptor'da ele alın.

---

## 8. React Önerileri

### 8.1. Oturum başlatma

```
login → token sakla
      → GET /api/users/me             (profil + roller)
      → GET /api/users/me/permissions (effective: roles + permissions + status)
```

```ts
type Authz = { roles: string[]; permissions: string[]; status: "pending"|"active"|"suspended" };

const can  = (p: string) => authz.permissions.includes(p);
const hasRole = (r: string) => authz.roles.includes(r);
const isPlatform = hasRole("super_admin") || hasRole("platform_support");

// Örnekler
const showUsersTab   = can("user.view");
const canSuspend     = can("user.manage");
const showRolesTab   = can("role.manage");
const showClaimsTab  = can("permission.manage");
const canPromoteSuper = can("role.manage") && hasRole("super_admin");
```

### 8.2. Tenant seçimi

- `super_admin` / `platform_support`: bir **üniversite seçici** göster; seçilen
  `universityId`'yi tüm `/api/admin/universities/:uid/...` çağrılarında kullan.
- Diğer roller: kendi `universityId`'leri (JWT/`/me`'den) sabit; seçici gösterme.
- `platform_support` yalnızca okuma yapabilir → yazma butonlarını `can()` ile gizle.

### 8.3. Anlık askı / 403 interceptor

Bir 403 alındığında (mesaj i18n olduğu için **metne göre eşleştirme yapmayın**):
oturum sahibinin kendisi askıya alınmışsa hemen hemen tüm korunan istekler 403
döner. Pratik yaklaşım: 403 alınca `GET /api/users/me` (veya `/me/permissions`)
ile `status`'u teyit et; `status === "suspended"` ise oturumu kapatıp `/login`'e
yönlendir ve `message`'ı göster. Diğer 403'lerde yalnızca `message`'ı toast'la.

### 8.4. Cache/state tazeleme

Rol/yetki değiştiren bir işlemden sonra (promote/demote, rol atama, claim
override) **hedef** kullanıcı bir sonraki isteğinde yeni yetkileri görür;
**kendi** oturumunuzu etkileyen bir değişiklik yaptıysanız
`GET /api/users/me/permissions`'ı yeniden çekin.

---

## 9. Enum Referansı

| Enum | Değerler |
|---|---|
| `user.status` | `pending`, `active`, `suspended` |
| `club.status` | `pending`, `approved`, `rejected`, `archived` |
| `join_policy` | `open`, `approval_required` |
| `application_status` | `pending`, `approved`, `rejected` |
| `club_role` (Katman B) | `member`, `officer`, `president` |
| `membership_status` | `pending`, `approved`, `rejected` |
| Roller (seed) | `student`, `advisor`, `university_admin`, `super_admin`, `platform_support`, `student_affairs`, `academic_affairs`, `content_moderator`, `auditor` |

---

## 10. Test Hesapları

Hepsi `Password123!`. Antalya (`antalya-bilim`):

| E-posta | Rol | Kullanım |
|---|---|---|
| `superadmin@antalya.edu.tr` | `super_admin` | Platform — tüm tenant + tüm yetkiler |
| `destek@antalya.edu.tr` | `platform_support` | Çapraz-tenant salt-okunur |
| `elif.demir@antalya.edu.tr` | `university_admin` | Antalya'nın tamamı |
| `sks@antalya.edu.tr` | `student_affairs` | Kulüp onay/danışman/üye/moderasyon |
| `ogrenci.isleri@antalya.edu.tr` | `academic_affairs` | Fakülte/bölüm/domain |
| `moderator@antalya.edu.tr` | `content_moderator` | Duyuru/galeri moderasyonu |
| `denetci@antalya.edu.tr` | `auditor` | Salt-okunur izleme |
| `elif.demir` dışı öğrenci/hoca hesapları | `student`/`advisor` | Katman B senaryoları |

Diğer tenant'lar: `okan.yildiz@egebilim.edu.tr` (Ege university_admin),
`sks@egebilim.edu.tr` (Ege student_affairs — tenant izolasyon testi),
`hulya.ozkan@kartek.edu.tr` (Karadeniz university_admin).
