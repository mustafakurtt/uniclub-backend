# 07 — Rol Rütbesi (Hiyerarşi) ve Tenant'sız Platform Hesapları

> Uygulandı: Temmuz 2026. Canlı sunucu + seed üzerinde 24 senaryoyla doğrulandı.
> Önceki adım için bkz. [06 — Rol Mimarisi Yeniden Tasarım](06-rol-mimarisi-yeniden-tasarim.md).

## Neden?

[06](06-rol-mimarisi-yeniden-tasarim.md) rol **çeşitliliğini** çözdü ama iki
yapısal boşluk kaldı:

1. **Her kullanıcı zorunlu bir üniversiteye bağlıydı** (`users.universityId NOT NULL`).
   `super_admin` seed'de Antalya'ya çakılıydı; "hiçbir okula ait olmayan şirket
   çalışanı" (platform destek, call center, sistem moderatörü) modellenemiyordu.
2. **Roller arasında yetki derecesi yoktu.** Sonuç: bir `university_admin` kendi
   admin rolünü söküp tenant'ı yönetimsiz bırakabiliyor, bir moderatör eşit ya da
   üst bir rolü kaldırabiliyordu. Tek ayrım "platform rolü mü, tenant rolü mü"ydü.

---

## A. Rol rütbesi (`roles.rank`)

Yüksek = daha yetkili. Aradaki 10'ar boşluk bilinçlidir (ileride ara kademe eklensin).

| Rol | rank | Kapsam |
|---|--:|---|
| `super_admin` | 100 | platform (tenant'sız) |
| `platform_support` | 90 | platform (tenant'sız, salt-okunur) |
| `university_admin` | 60 | tenant |
| `academic_affairs` | 45 | tenant |
| `student_affairs` | 45 | tenant |
| `content_moderator` | 30 | tenant |
| `auditor` | 30 | tenant (salt-okunur) |
| `advisor` | 20 | tenant (yetenek etiketi) |
| `student` | 10 | tenant |

Kaynak: `db/seed.ts` `roleDefs`. **Mevcut bir DB'de** `rank` kolonu `DEFAULT 0` ile
eklenir; `db/sync-permissions.ts` içindeki `ROLE_RANKS` backfill'i bu değerleri geri
yazar. İkisi birbirinden saparsa hiyerarşi iki kaynak arasında kayar.

> ⚠️ Rütbeler backfill edilmezse tüm roller `0` kalır ve `rank >= actor.maxRank`
> kuralı (0 >= 0) **tüm rol yönetimini kilitler**.

### Kurallar (`features/auth/auth.service.ts`)

Aktörün rütbesi = rollerindeki **en yüksek** `rank` (`EffectivePermissions.maxRank`,
Redis'te cache'lenir). `super_admin` tüm rütbe kontrollerinden muaftır.

| Guard | Kural | Kapattığı açık |
|---|---|---|
| `assertActorOutranksRole` | `role.rank < actor.maxRank` | Kendine/başkasına eşit ya da üst rol atama/sökme |
| `assertActorOutranksUser` | `hedef.maxRank < actor.maxRank` | Eşit/üst rütbeli kullanıcıya dokunma (peer admin'i sökme) |
| `assertNotSelfRoleRemoval` | `actor.userId !== targetUserId` | **Kendi rolünü sökme** (super_admin dahil — dört göz ilkesi) |
| `assertNotLastAdminOfScope` | son `super_admin` / bir tenant'ın son `university_admin`'i | Sistemi/tenant'ı yönetimsiz bırakma |
| `assertPermissionAttachable` | aktör yetkiyi kendi taşımalı | Düşük rütbeli özel rol üretip ona güçlü yetki bağlayarak dolaylı yükselme |
| `createRole` / `updateRole` | yeni `rank < actor.maxRank` | Kendinden güçlü rol üretip kendine atama |

**Kendine rol EKLEME serbesttir** (rütbe kuralı yükseltmeyi zaten kapatır): bir
yönetici kendine `student` rolü ekleyebilir, `super_admin` ekleyemez.
**Kendinden rol SÖKME hiçbir koşulda serbest değildir.**

Çekirdek rollerin (`CORE_ROLE_NAMES`) hem **adı** hem **rütbesi** değiştirilemez.

---

## B. Tenant'sız platform hesapları

`users.universityId` artık **nullable**:

- `NULL` → **platform hesabı**. Şirketin kendi çalışanı. Hiçbir üniversiteye ait
  değildir; tenant scope'unu **rolüyle** bypass eder
  (`TENANT_SCOPE_BYPASS_ROLES` = `super_admin`, `platform_support`).
- dolu → öğrenci/personel. Kayıt akışı tenant'ı e-posta domain'inden çıkarır.

Sonuçlar:

- **E-posta tekilliği:** `(university_id, email)` bileşik index NULL'ları çakıştırmaz
  (Postgres'te NULL'lar birbirinden farklıdır). Bu yüzden ayrı bir **partial unique
  index** var: `platform_user_email_idx ON users(email) WHERE university_id IS NULL`.
- **JWT:** `JwtPayload.universityId: string | null`.
- **Öğrenci akışları:** platform hesabının tenant'ı olmadığı için "hangi okulun
  kulüpleri?" sorusu tanımsızdır. `shared/utils/tenant.util.ts` → `requireTenant()`
  bu akışların girişinde 400 döner ("Bu işlem bir üniversiteye bağlı hesap gerektirir.").
- **Bypass'sız platform hesabı** (ileride `call_center` gibi) hiçbir tenant kaynağına
  erişemez — `enforceTenantScope`'ta `null` hiçbir `:universityId` ile eşleşmez.

Seed hesapları: `superadmin@platform.local`, `superadmin2@platform.local`,
`destek@platform.local` (hepsi `universityId: NULL`).

---

## C. Kapsam-farkında görünürlük

`GET /api/admin/universities` — **aktörün yönetim bağlamında görebildiği** üniversiteler:

- platform seviyesi rol (`super_admin` / `platform_support`) → **hepsi**
- tenant kullanıcısı → **yalnızca kendi üniversitesi**
- bypass'sız platform hesabı → **hiçbiri**

Yönetim paneli, akademik yapı ekranlarında global/public `GET /api/universities`
(kayıt formu için vardır ve public kalır) yerine **bunu** kullanmalıdır. Aksi halde
bir `university_admin` panelde başka üniversiteleri de görür.

> Not: Bu bir yetki sızıntısı düzeltmesi değildi — akademik yapının **yazma**
> rotaları zaten `tenantScoped`'tı, yani bir tenant yöneticisi başka bir okulun
> fakültesini hiçbir zaman değiştiremiyordu. Sorun panelin **yanlış kaynağı**
> okumasıydı; bu endpoint doğru kaynağı verir.

---

## D. Ertelenenler

- **Bölge (region) katmanı.** "Bölge sorumlusu birden çok üniversiteyi görsün"
  senaryosu için yol: `regions` tablosu + `universities.regionId` + `userRoles`'a
  nullable `scopeUniversityId` / `scopeRegionId`. Böylece AYNI rol bir kullanıcıya
  farklı kapsamlarda (tek okul / bölge / global) atanabilir ve
  `listAccessibleUniversities` üç dallı hale gelir. Şema notu `db/schema.ts`
  `roles` tanımının üstündedir.
- **Runtime'da platform hesabı oluşturma.** Bugün yalnızca seed ile kurulur;
  `super_admin` için bir `POST /admin/platform-users` endpoint'i eklenebilir.
- **Fakülte kapsamı** (Dekan / Bölüm Başkanı) — bkz. [06 §B3](06-rol-mimarisi-yeniden-tasarim.md).
