# Yeni Üniversite (Tenant) Açma Runbook'u

Bu doküman, SaaS operatörünün **yeni bir üniversiteyi uçtan uca** sisteme alması
için çalıştırılabilir prosedürdür. Sattığımız birim bir üniversitedir; bugün bu
akış fiilen seed/SQL ile yapılıyor gibi görünse de API bunu destekler.

> **Dil:** Operasyon prosedürü Türkçe; API `message` alanları `Accept-Language`'e
> göre döner (varsayılan `tr`).  
> **Kaynak kod:** `src/features/university/*`, `src/features/auth/*`,
> `src/db/bootstrap.ts`, `src/db/rbac-catalog.ts`.

---

## Özet akış

```
super_admin giriş
    → POST /api/universities (tenant + domainler)
    → POST .../faculties + .../departments (akademik ağaç)
    → İlk personel POST /api/auth/register (staff domain)
    → PATCH /api/auth/users/:id/promote-admin (university_admin)
    → Doğrulama (kayıt + GET /api/admin/universities)
```

---

## 0. Ön koşullar

### Ortam

- API ayakta (`bun run dev` veya prod deploy).
- Postgres + Redis çalışıyor (`docker-compose up -d`).
- RBAC kataloğu kurulu:
  - **Prod:** `bun run db:bootstrap` (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` ile).
  - **Dev:** `bun run db:migrate && bun run db:seed`.

### Kim yapar?

| Rol | Kim |
|---|---|
| Tüm adımlar | **`super_admin`** (platform operatörü) |

`university.create`, `university.delete` ve global `role.manage` yalnızca
`super_admin`'de (`ROLE_BUNDLES` — `university_admin` bu yetkileri **taşımaz**).

### Gerekli yetkiler (adım bazında)

| Adım | Yetki anahtarı | Not |
|---|---|---|
| Üniversite oluştur | `university.create` | `POST /api/universities` — tenantScoped **değil** |
| Domain ekle/güncelle | `university.domain.*` | Oluşturma sırasında domainler body'de de verilebilir |
| Fakülte/bölüm | `university.faculty.*`, `university.department.*` | super_admin tenant bypass ile her `:universityId`'yi hedefler |
| İlk yönetici atama | `role.manage` | `PATCH .../promote-admin` veya `POST .../roles` |

### Değişkenler (örnek)

Aşağıdaki curl örneklerinde şunları kendi ortamınıza göre değiştirin:

```bash
BASE=http://localhost:3000
# Bootstrap veya seed'deki super_admin ile login
SUPER_EMAIL=superadmin@platform.local
SUPER_PASS=Password123!
```

---

## 1. Operatör oturumu aç

```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"$SUPER_PASS\"}" \
  | jq .
```

Yanıttan `token` alın:

```bash
export TOKEN="<login yanıtındaki token>"
```

Tüm sonraki isteklerde:

```bash
-H "Authorization: Bearer $TOKEN"
```

---

## 2. Üniversite oluştur (domainlerle birlikte)

`POST /api/universities` hem tenant kaydını hem en az bir e-posta domainini
oluşturur. Slug ve domainler **global benzersiz** olmalıdır.

### `student` / `staff` ayrımı

| `domainType` | Kayıt sonrası rol | Tipik kullanım |
|---|---|---|
| `student` | `student` | `@std.okul.edu.tr` — öğrenci self-servis kayıt |
| `staff` | `advisor` | `@okul.edu.tr` — personel; danışman havuzu + yönetici adayı |

Kayıt akışı tenant'ı e-postanın `@` sonrası domaininden çözer; domain yoksa
kayıt reddedilir (`auth.emailDomainNotRegistered`).

```bash
curl -s -X POST "$BASE/api/universities" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Örnek Bilim Üniversitesi",
    "slug": "ornek-bilim",
    "domains": [
      { "domain": "std.ornek.edu.tr", "domainType": "student" },
      { "domain": "ornek.edu.tr", "domainType": "staff" }
    ]
  }' | jq .
```

`data.id` değerini kaydedin:

```bash
export UNIVERSITY_ID="<yanıttaki data.id>"
```

**Doğrulama (public, auth gerekmez):**

```bash
curl -s "$BASE/api/universities/$UNIVERSITY_ID" | jq '.data.domains'
```

### Sonradan domain ekleme (opsiyonel)

```bash
curl -s -X POST "$BASE/api/universities/$UNIVERSITY_ID/domains" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "domain": "personel.ornek.edu.tr", "domainType": "staff" }' | jq .
```

> Son domain silinemez (`domain.lastCannotDelete`). Üniversitenin en az bir domaini
> kalmalıdır — kayıt akışı buna bağlıdır.

---

## 3. Fakülte ve bölüm ağacı

Bölümler **fakülte altında** oluşturulur (`departments` tablosu `universityId`
taşımaz — kasıtlı tasarım).

### Fakülte

```bash
curl -s -X POST "$BASE/api/universities/$UNIVERSITY_ID/faculties" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Mühendislik Fakültesi" }' | jq .
```

```bash
export FACULTY_ID="<yanıttaki data.id>"
```

### Bölüm

```bash
curl -s -X POST "$BASE/api/universities/$UNIVERSITY_ID/faculties/$FACULTY_ID/departments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Bilgisayar Mühendisliği" }' | jq .
```

Ek fakülte/bölümler için adımları tekrarlayın. Public liste:

```bash
curl -s "$BASE/api/universities/$UNIVERSITY_ID/faculties" | jq .
curl -s "$BASE/api/universities/$UNIVERSITY_ID/faculties/$FACULTY_ID/departments" | jq .
```

---

## 4. İlk `university_admin`

### Bugün API'de olmayan: doğrudan kullanıcı oluşturma

Tenant kullanıcısı için **`POST /admin/users` veya benzeri bir endpoint yok**.
Kullanıcılar yalnızca:

- `POST /api/auth/register` (self-servis), veya
- `db:seed` / SQL (dev)

ile oluşturulur. Platform hesapları (`universityId: null`) yalnızca
`db:bootstrap` ile açılır — tenant yöneticisi **böyle oluşturulmaz**.

### Önerilen prosedür (API ile)

**4a.** İlk yöneticinin **staff domain** ile kayıt olması (e-posta doğrulama
akışı dahil — dev'de link konsol/Mailpit'ten):

```bash
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Ayşe",
    "lastName": "Yönetici",
    "email": "ayse.yonetici@ornek.edu.tr",
    "password": "GeciciSifre123!",
    "studentNumber": null
  }' | jq .
```

Kayıt sonrası kullanıcı `advisor` rolü + `pending` status alır. Doğrulama:

```bash
# Dev: backend konsolundaki verify linkini açın veya Mailpit (http://localhost:8025)
curl -s "$BASE/api/auth/verify?token=<DOGRULAMA_TOKEN>" | jq .
```

**4b.** `super_admin`, kullanıcıyı tenant yöneticisi yapar.

Önce kullanıcı `id`'sini bulun (super_admin tenant bypass ile):

```bash
curl -s "$BASE/api/admin/universities/$UNIVERSITY_ID/users?role=advisor" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.email=="ayse.yonetici@ornek.edu.tr")'
```

```bash
export ADMIN_USER_ID="<bulunan id>"
```

**Yöntem A — promote-admin (önerilen, geriye uyumlu):**

```bash
curl -s -X PATCH "$BASE/api/auth/users/$ADMIN_USER_ID/promote-admin" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

İçeride `university_admin` global rolü eklenir; mevcut `advisor` rolü **kalır**
(union).

**Yöntem B — genel rol atama:**

```bash
# Önce university_admin rol id'si
curl -s "$BASE/api/auth/roles" -H "Authorization: Bearer $TOKEN" \
  | jq '.data[] | select(.name=="university_admin") | .id'

export ROLE_ID="<university_admin uuid>"

curl -s -X POST "$BASE/api/auth/users/$ADMIN_USER_ID/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"roleId\": \"$ROLE_ID\" }" | jq .
```

> Hedef kullanıcının `users.universityId` dolu olmalıdır (platform hesabına
> `university_admin` atanamaz). `promote-admin` tenant doğrulaması yapar.

### Dev kısayolu (yalnızca geliştirme)

`bun run db:seed` içindeki `createUser({ ..., role: "university_admin" })` deseni
prod'da **kullanılmamalıdır**. Prod'da yalnızca §4a–4b API akışı geçerlidir.

---

## 5. Doğrulama adımları

### 5.1 Domain → tenant eşleşmesi

Staff veya student domain ile kayıt:

```bash
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Ogrenci",
    "email": "test.ogrenci@std.ornek.edu.tr",
    "password": "Test123456!"
  }' | jq '.data.universityId'
```

Dönen `universityId` = `$UNIVERSITY_ID` olmalı.

Yanlış domain:

```bash
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"X","lastName":"Y","email":"x@gmail.com","password":"Test123456!"}' | jq .
# → 400, domain kayıtlı değil
```

### 5.2 Yeni admin yalnızca kendi tenant'ını görür

Yeni yönetici ile login:

```bash
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ayse.yonetici@ornek.edu.tr","password":"GeciciSifre123!"}' \
  | jq -r .token
```

```bash
export ADMIN_TOKEN="<yeni token>"

curl -s "$BASE/api/admin/universities" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```

Beklenen: **yalnızca Örnek Bilim** (tek eleman). `GET /api/universities` (public,
tüm okullar) panelde tenant seçici için **kullanılmamalı** — bkz.
`docs/design/07-rutbe-ve-kapsam.md` §C.

### 5.3 Yetki kontrolü

```bash
curl -s "$BASE/api/users/me/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data.roles'
# "university_admin" (ve muhtemelen "advisor") içermeli
```

### 5.4 Akademik yapı yazma

```bash
curl -s -X POST "$BASE/api/universities/$UNIVERSITY_ID/faculties" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "İktisadi ve İdari Bilimler Fakültesi" }' | jq .
# → 201 (university_admin'de university.faculty.create var)
```

Başka tenant'ı hedefleme (403):

```bash
# Başka bir UNIVERSITY_ID ile aynı istek → enforceTenantScope reddeder
```

---

## 6. Geri alma / yanlış açılan tenant

### Henüz kullanıcı ve fakülte yoksa — tam silme

`DELETE /api/universities/:id` yalnızca şu durumda başarılı:

- Bağlı **kullanıcı yok**
- Bağlı **kulüp yok**
- Bağlı **fakülte yok** (önce bölümler, sonra fakülteler silinmeli)

Sıra (boş tenant):

```bash
# Bölümler → fakülteler → üniversite
curl -s -X DELETE "$BASE/api/universities/$UNIVERSITY_ID/faculties/$FACULTY_ID/departments/$DEPT_ID" \
  -H "Authorization: Bearer $TOKEN"

curl -s -X DELETE "$BASE/api/universities/$UNIVERSITY_ID/faculties/$FACULTY_ID" \
  -H "Authorization: Bearer $TOKEN"

curl -s -X DELETE "$BASE/api/universities/$UNIVERSITY_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Üniversite **yumuşak silinir**; domainler fiziksel temizlenir (`universityService`).

### Yanlış slug/isim — düzeltme

Kullanıcı varken de mümkün:

```bash
curl -s -X PATCH "$BASE/api/universities/$UNIVERSITY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Düzeltilmiş Üniversite Adı", "slug": "duzeltilmis-slug" }' | jq .
```

Slug benzersizlik kontrolü silinmiş kayıtlar dahil tüm slug'lara bakar.

### Yanlış domain

- Ek domain eklendi, yanlışsa: `DELETE .../domains/:domainId` (en az bir domain kalmalı).
- İlk oluşturmadaki domain yanlışsa: doğru domain ekleyin; yanlış olanı silin.
- **Yanlış domain ile kayıt olmuş kullanıcılar** API ile taşınamaz — bölüm atama
  (`PATCH .../department`) ve moderasyon dışında kullanıcı `universityId` değişmez.
  Ciddi hatalarda operasyon ekibi DB müdahalesi gerekir (prod'da change window +
  yedek).

### Kullanıcı veya kulüp oluştuktan sonra

`DELETE /api/universities/:id` **reddedilir** (`university.hasUsers` /
`university.hasClubs` / `university.hasFaculties`). Seçenekler:

1. Tenant'ı **askıya alma** akışı yok (üniversite düzeyinde) — ürün kararı gerekir.
2. Kulüpleri `archived` → `DELETE` (admin), kullanıcıları ban (`/api/moderation`).
3. Kullanıcı silme API'si yok (FK ağı) — KVKK anonimleştirme Hat A kapsamında.

### Domain'i başka tenant'a taşıma

**Desteklenmiyor.** Domain global benzersizdir; taşımak yerine eski tenant'ta
silip yenisinde eklemek gerekir — o domain ile kayıtlı kullanıcılar varsa önce
operasyonel çözüm şart.

---

## 7. Prod checklist

- [ ] `db:bootstrap` çalıştırıldı, `super_admin` var
- [ ] Üniversite + `student` + `staff` domainleri oluşturuldu
- [ ] En az bir fakülte/bölüm (kayıt formu için)
- [ ] İlk `university_admin` atandı ve `GET /api/admin/universities` doğrulandı
- [ ] Test öğrenci kaydı doğru `universityId` döndürdü
- [ ] `docs/API.md` ve frontend ekibi bilgilendirildi (yeni slug/domain)

---

## İlgili dokümanlar

- [API.md — University](API.md#3-university--apiuniversities)
- [design/07-rutbe-ve-kapsam.md](design/07-rutbe-ve-kapsam.md) — `GET /admin/universities`
- [adr/0007-email-domain-tenant-inference.md](adr/0007-email-domain-tenant-inference.md)
- [operations.md](operations.md) — deploy ve yedekleme
