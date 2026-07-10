# University Katmanı — Frontend Entegrasyon Dokümanı

**Kapsam:** `university` feature'ının (`/api/universities`) tam referansı — public okuma rotaları (kayıt formu akışı) ve sistem yönetim paneli için üniversite / e-posta domaini / fakülte / bölüm yönetimi (CRUD).

> Bu doküman kod tabanından birebir doğrulanmıştır. Backend'in tüm hata mesajları ve `message` alanları **Türkçedir** — UI'da doğrudan gösterilebilir. Özet katalog için `docs/API.md §3`, genel Auth/RBAC yapılanması için `docs/FRONTEND_AUTH_RBAC.md`'ye bakın.

---

## İçindekiler

- [1. Bu Katman Nedir?](#1-bu-katman-nedir)
- [2. Yetki (Permission) Modeli — Granüler `university.*`](#2-yetki-permission-modeli--granüler-university)
- [3. Ortak Kurallar](#3-ortak-kurallar)
- [4. Üniversiteler](#4-üniversiteler)
- [5. Domainler (e-posta domainleri)](#5-domainler-e-posta-domainleri)
- [6. Fakülteler](#6-fakülteler)
- [7. Bölümler](#7-bölümler)
- [8. Frontend Akışları](#8-frontend-akışları)
- [9. Hata Durumları Sözlüğü](#9-hata-durumları-sözlüğü)

---

## 1. Bu Katman Nedir?

Tenant hiyerarşisi: **Üniversite → Domain / Fakülte → Bölüm**.

```
universities (tenant)
├── university_domains   (e-posta domainleri: "std.antalya.edu.tr" → student, "antalya.edu.tr" → staff)
└── faculties
    └── departments
```

İki tür tüketici vardır:

| Tüketici | Kullandığı rotalar | Auth |
|---|---|---|
| **Kayıt formu / public UI** | Tüm `GET` rotaları | Gerekmez (public) |
| **Sistem yönetim paneli** | `POST` / `PATCH` / `DELETE` | Bearer + granüler `university.*` permission |

**Önemli:** `departments` tablosu `universityId` taşımaz (kasıtlı — bölüme her zaman `faculty` zinciriyle ulaşılır). Bu yüzden bölüm listesini **mutlaka** `facultyId` üzerinden çekin; "üniversitenin tüm bölümleri" diye tek atışta bir endpoint yoktur.

---

## 2. Yetki (Permission) Modeli — Granüler `university.*`

Eski tek `university.manage` yetkisi kaldırıldı. Yerine **kaynak + aksiyon** bazlı 12 ayrı permission geldi. Böylece yönetim panelinde bir kullanıcıya (örn. bir okul yöneticisine) yalnızca ihtiyacı olan işlemleri (checkbox bazlı) verebilirsiniz:

| Kaynak | create | update | delete |
|---|---|---|---|
| Üniversite | `university.create` | `university.update` | `university.delete` |
| Domain | `university.domain.create` | `university.domain.update` | `university.domain.delete` |
| Fakülte | `university.faculty.create` | `university.faculty.update` | `university.faculty.delete` |
| Bölüm | `university.department.create` | `university.department.update` | `university.department.delete` |

- Seed'de bu 12 yetkinin **tamamı `super_admin` rolüne** atanır. Okul yöneticisi (`admin`) rolüne varsayılan olarak atanmaz — istenirse `POST /api/auth/roles/:roleId/permissions` ile tek tek eklenebilir (bkz. `FRONTEND_AUTH_RBAC.md §4`).
- **Okuma (GET) rotaları hiçbir permission gerektirmez** — bu yüzden bir `university.view` anahtarı yoktur.
- Yetki eksikse backend `403` + `{ success: false, message: "Bu işlem için yetkiniz bulunmamaktadır." }` döner.

### Tenant scope (kendi üniversiten / super_admin bypass)

`:universityId` taşıyan tüm **yazma** rotaları `tenantScoped`'tır:

- **`super_admin`** → tenant kontrolünü **bypass eder**, herhangi bir üniversiteyi hedefleyebilir.
- Diğer roller → `:universityId` **kendi `universityId`'leri ile eşleşmeli**, aksi halde `403` + `"Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır."`.
- **İstisna:** `POST /api/universities` (üniversite oluşturma) tenantScoped **değildir** — henüz bir tenant yoktur, dolayısıyla bu işlem doğası gereği yalnızca `university.create` yetkisi olan (pratikte super_admin) kullanıcılar içindir.

> Pratikte: bugün bu yetkiler yalnızca super_admin'de olduğundan tenant scope bir no-op gibi davranır; ama başka bir role bu yetkiler verilirse otomatik olarak kendi üniversitesiyle sınırlı kalır (defense-in-depth).

---

## 3. Ortak Kurallar

- **Base URL (dev):** `http://localhost:3000`. Tüm rotalar `/api/universities` altında.
- **Response zarfı:** `{ success, message, data }`. Oluşturma (`POST`) → `201`. Silme → `data` içermez.
- **Auth header (yalnızca yazma rotaları):** `Authorization: Bearer <token>`.
- **Hata → status:** mesajda "bulunamadı" geçiyorsa `404`, diğer iş kuralı ihlalleri `400`, yetki `401/403`.
- Zod validasyon hataları `400` ile zod hata formatında döner (`error.issues[].message` Türkçe).

---

## 4. Üniversiteler

### 4.1 Üniversiteleri listele — `GET /api/universities?search=`  · public

Hafif kolon seti döner (domain/fakülte içermez). `search` opsiyonel (1-256 karakter), `name` içinde `ILIKE` araması yapar.

```jsonc
// GET /api/universities?search=antalya
{
  "success": true,
  "message": "Üniversiteler listelendi.",
  "data": [
    { "id": "uuid", "name": "Antalya Bilim Üniversitesi", "slug": "antalya-bilim", "createdAt": "2026-..." }
  ]
}
```

### 4.2 Tek üniversite (domainleriyle) — `GET /api/universities/:universityId`  · public

```jsonc
{
  "success": true,
  "message": "Üniversite bulundu.",
  "data": {
    "id": "uuid", "name": "Antalya Bilim Üniversitesi", "slug": "antalya-bilim",
    "createdAt": "...", "updatedAt": "...",
    "domains": [
      { "id": "uuid", "universityId": "uuid", "domain": "std.antalya.edu.tr", "domainType": "student", "createdAt": "...", "updatedAt": "..." },
      { "id": "uuid", "universityId": "uuid", "domain": "antalya.edu.tr", "domainType": "staff", "createdAt": "...", "updatedAt": "..." }
    ]
  }
}
```

Bulunamazsa `404` + `"Üniversite bulunamadı."`.

### 4.3 Üniversite oluştur — `POST /api/universities`  · `university.create`

```jsonc
// Request body
{
  "name": "Örnek Üniversitesi",        // 2-256
  "slug": "ornek-uni",                  // 2-256, sistemde benzersiz olmalı
  "domains": [                          // en az 1
    { "domain": "std.ornek.edu.tr", "domainType": "student" },
    { "domain": "ornek.edu.tr",     "domainType": "staff" }
  ]
}
```

```jsonc
// 201
{
  "success": true,
  "message": "Üniversite oluşturuldu.",
  "data": { "university": { /* ... */ }, "domains": [ /* ... */ ] }
}
```

İş kuralları (hepsi `400`):
- `"Bu slug zaten kullanılıyor."` — slug benzersiz değil.
- `"\"<domain>\" domaini istekte birden fazla kez girilmiş."` — body içinde tekrar eden domain.
- `"\"<domain>\" domaini zaten kayıtlı."` — domain başka bir üniversitede mevcut.

### 4.4 Üniversite güncelle — `PATCH /api/universities/:universityId`  · `university.update` · tenantScoped

```jsonc
// Body — en az bir alan
{ "name": "Yeni Ad", "slug": "yeni-slug" }
```

Yanıt: güncel üniversite satırı. Hatalar: `404 "Üniversite bulunamadı."`, `400 "Bu slug zaten kullanılıyor."`.

### 4.5 Üniversite sil — `DELETE /api/universities/:universityId`  · `university.delete` · tenantScoped

Yalnızca **bağlı ağır kaydı olmayan** üniversite silinebilir. Domainler otomatik temizlenir; fakülte/kullanıcı/kulüp varsa silme reddedilir.

```jsonc
// 200
{ "success": true, "message": "Üniversite silindi." }
```

Reddetme (`400`):
- `"Bu üniversiteye bağlı kullanıcılar var, silinemez."`
- `"Bu üniversiteye bağlı kulüpler var, silinemez."`
- `"Bu üniversitenin fakülteleri var, önce fakülteleri silin."`

> UI önerisi: silme butonuna basınca önce bir onay modalı göster; backend zaten güvenli reddeder, ama kullanıcıya "önce X'i temizle" mesajını doğrudan `message` alanından gösterebilirsin.

---

## 5. Domainler (e-posta domainleri)

Domainler, kayıt (register) akışında tenant çözümü için kullanılır: `user@std.antalya.edu.tr` → domain tablosunda aranır → üniversite ve rol (`student`/`staff`) belirlenir.

### 5.1 Domainleri listele — `GET /api/universities/:universityId/domains`  · public

```jsonc
{
  "success": true,
  "message": "Domainler listelendi.",
  "data": [ { "id": "uuid", "domain": "std.antalya.edu.tr", "domainType": "student", "...": "..." } ]
}
```

### 5.2 Domain ekle — `POST /api/universities/:universityId/domains`  · `university.domain.create` · tenantScoped

```jsonc
// Body
{ "domain": "yeni.antalya.edu.tr", "domainType": "student" }  // domainType: "student" | "staff"
```
`201` + eklenen domain. Hata: `400 "Bu domain zaten kayıtlı."`, `404 "Üniversite bulunamadı."`.

### 5.3 Domain güncelle — `PATCH /api/universities/:universityId/domains/:domainId`  · `university.domain.update` · tenantScoped

```jsonc
// Body — en az bir alan
{ "domain": "guncel.antalya.edu.tr", "domainType": "staff" }
```
Hata: `404 "Domain bulunamadı."`, `400 "Bu domain zaten kayıtlı."`.

### 5.4 Domain sil — `DELETE /api/universities/:universityId/domains/:domainId`  · `university.domain.delete` · tenantScoped

**Üniversitenin son domaini silinemez** — aksi halde o üniversiteye kimse kayıt olamaz.

```jsonc
{ "success": true, "message": "Domain silindi." }
```
Hata: `404 "Domain bulunamadı."`, `400 "Üniversitenin en az bir domaini olmalıdır, son domain silinemez."`.

---

## 6. Fakülteler

### 6.1 Fakülteleri listele — `GET /api/universities/:universityId/faculties`  · public

```jsonc
{
  "success": true,
  "message": "Fakülteler listelendi.",
  "data": [ { "id": "uuid", "universityId": "uuid", "name": "Mühendislik Fakültesi", "...": "..." } ]
}
```

### 6.2 Tek fakülte — `GET /api/universities/:universityId/faculties/:facultyId`  · public

`404 "Fakülte bulunamadı."` (fakülte bu üniversiteye ait değilse de).

### 6.3 Fakülte oluştur — `POST /api/universities/:universityId/faculties`  · `university.faculty.create` · tenantScoped

```jsonc
// Body
{ "name": "İktisadi ve İdari Bilimler Fakültesi" }  // 2-256
```
`201` + oluşan fakülte. `404 "Üniversite bulunamadı."`.

### 6.4 Fakülte güncelle — `PATCH /api/universities/:universityId/faculties/:facultyId`  · `university.faculty.update` · tenantScoped

```jsonc
{ "name": "Yeni Fakülte Adı" }
```

### 6.5 Fakülte sil — `DELETE /api/universities/:universityId/faculties/:facultyId`  · `university.faculty.delete` · tenantScoped

**Bölümü olan fakülte silinemez.**

Hata: `404 "Fakülte bulunamadı."`, `400 "Bu fakültenin bölümleri var, önce bölümleri silin."`.

---

## 7. Bölümler

Tüm bölüm rotaları `.../faculties/:facultyId/departments...` altında. Backend her zaman "bu bölüm bu fakülteye, bu fakülte bu üniversiteye ait mi?" zincirini doğrular.

### 7.1 Bölümleri listele — `GET .../faculties/:facultyId/departments`  · public

```jsonc
{
  "success": true,
  "message": "Bölümler listelendi.",
  "data": [ { "id": "uuid", "facultyId": "uuid", "name": "Bilgisayar Mühendisliği", "...": "..." } ]
}
```

### 7.2 Tek bölüm — `GET .../departments/:departmentId`  · public

`404 "Fakülte bulunamadı."` veya `404 "Bölüm bulunamadı."`.

### 7.3 Bölüm oluştur — `POST .../faculties/:facultyId/departments`  · `university.department.create` · tenantScoped

```jsonc
{ "name": "Yazılım Mühendisliği" }  // 2-256
```

### 7.4 Bölüm güncelle — `PATCH .../departments/:departmentId`  · `university.department.update` · tenantScoped

```jsonc
{ "name": "Yeni Bölüm Adı" }
```

### 7.5 Bölüm sil — `DELETE .../departments/:departmentId`  · `university.department.delete` · tenantScoped

**Bu bölüme atanmış kullanıcı varsa silinemez** (`users.departmentId`).

Hata: `404 "Bölüm bulunamadı."`, `400 "Bu bölüme bağlı kullanıcılar var, silinemez."`.

---

## 8. Frontend Akışları

### 8.1 Kayıt formu (public — auth yok)

```
1) GET /api/universities?search=...          → üniversite seçtir
2) GET /api/universities/:id/faculties        → fakülte seçtir
3) GET /:id/faculties/:facultyId/departments  → bölüm seçtir
4) POST /api/auth/register                     → seçilen department + okul maili ile kayıt
```

Kayıtta üniversite ayrı bir alan olarak gönderilmez — backend e-posta domaininden çözer. Yani formda üniversite seçimi yalnızca **fakülte/bölüm ağacını daraltmak** ve kullanıcıya doğru maili hatırlatmak içindir.

### 8.2 Sistem yönetim paneli (super_admin)

Panel açılışında kullanıcının rolünü `GET /api/users/me` (`data.roles[]`) ile kontrol et; `super_admin` yoksa paneli gizle. Ağaç görünümü önerisi:

```
Üniversite (CRUD)
 ├── Domainler (CRUD, son domain silinemez uyarısı)
 └── Fakülteler (CRUD)
      └── Bölümler (CRUD)
```

Her yazma butonunun görünürlüğünü ilgili granüler yetkiye bağla (örn. "Fakülte Ekle" butonu yalnızca `university.faculty.create` varsa). **Not:** backend şu an flatten edilmiş etkin permission listesini bir endpoint'ten döndürmüyor (bkz. `FRONTEND_AUTH_GUARD_GUIDE.md §3`); o ekleneceği güne kadar butonları rol adına (`super_admin`) göre gösterebilirsin.

### 8.3 Silme sırası (FK güvenliği)

Backend, bağımlısı olan kaydın silinmesini reddeder. Bir üniversiteyi tamamen kaldırmak için **aşağıdan yukarı** ilerle:

```
bölümler → fakülteler → (kullanıcılar/kulüpler admin panelinden) → domainler otomatik → üniversite
```

Kullanıcıya her adımda backend'in döndürdüğü `message`'ı göstermek yeterli; hangi bağımlının kaldığını mesaj zaten söylüyor.

---

## 9. Hata Durumları Sözlüğü

| Mesaj | Status | Nerede |
|---|---|---|
| `Üniversite bulunamadı.` | 404 | get/update/delete/domain/faculty işlemleri |
| `Fakülte bulunamadı.` | 404 | faculty/department işlemleri |
| `Bölüm bulunamadı.` | 404 | department get/update/delete |
| `Domain bulunamadı.` | 404 | domain update/delete |
| `Bu slug zaten kullanılıyor.` | 400 | üniversite create/update |
| `"<domain>" domaini zaten kayıtlı.` / `Bu domain zaten kayıtlı.` | 400 | üniversite create / domain create/update |
| `"<domain>" domaini istekte birden fazla kez girilmiş.` | 400 | üniversite create |
| `Üniversitenin en az bir domaini olmalıdır, son domain silinemez.` | 400 | domain delete |
| `Bu üniversiteye bağlı kullanıcılar var, silinemez.` | 400 | üniversite delete |
| `Bu üniversiteye bağlı kulüpler var, silinemez.` | 400 | üniversite delete |
| `Bu üniversitenin fakülteleri var, önce fakülteleri silin.` | 400 | üniversite delete |
| `Bu fakültenin bölümleri var, önce bölümleri silin.` | 400 | fakülte delete |
| `Bu bölüme bağlı kullanıcılar var, silinemez.` | 400 | bölüm delete |
| `Bu işlem için yetkiniz bulunmamaktadır.` | 403 | eksik `university.*` permission |
| `Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır.` | 403 | tenant scope ihlali (super_admin değilse) |
