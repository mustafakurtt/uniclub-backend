# Yönetim Paneli — Kullanıcı / Rol / Yetki (Claim) Senaryoları

**Kapsam:** Yönetim sayfasının (super_admin + admin panelleri) kullanıcı yönetimi,
rol yönetimi ve yetki (claim/permission) yönetimi işlevlerinin **tamamının**
senaryolarla, ilişki yapıları göz önünde bulundurularak dökümante edilmesi.

> Bu doküman kod tabanından birebir doğrulanmıştır (`schema.ts`, `relations.ts`,
> `seed.ts`, `auth.*`, `admin.*`, `core/rbac/*`, `shared/rbac/*` — Temmuz 2026).
> Tüm backend mesajları **Türkçedir** ve UI'da doğrudan gösterilebilir.

> ⚠️ **GÜNCEL MODEL (Temmuz 2026):** Rol/yetki mimarisi kurumsal **9 rollük**
> modele geçirildi (`admin` → `university_admin`; + `platform_support`,
> `student_affairs`, `academic_affairs`, `content_moderator`, `auditor`).
> Bu dosyanın §2/§3'ündeki 4-rollük matris **eskidir** — güncel ve otoritatif
> kaynak: [06-rol-mimarisi-yeniden-tasarim.md](06-rol-mimarisi-yeniden-tasarim.md)
> (§ "✅ UYGULANDI"). Guard'lar da düzeltildi: okuma route'ları artık `*.view`
> yetkileri ister.
>
> ⚠️ **DAHA DA GÜNCEL:** Rollere **rütbe (`roles.rank`)** eklendi ve
> `users.universityId` **nullable** yapıldı (tenant'sız platform hesapları).
> Bu, §2'deki "rol hiyerarşisi" ve §5'teki "her kullanıcı bir universityId'ye
> bağlıdır" ifadelerini **geçersiz kılar**. Otoritatif kaynak:
> [07-rutbe-ve-kapsam.md](07-rutbe-ve-kapsam.md).

Bu klasör uzun olduğu için dosyalara bölünmüştür:

| Dosya | İçerik |
|---|---|
| **README.md** (bu dosya) | Genel model, rol hiyerarşisi, iki katman, effective permission, tenant scope, rol→yetki matrisi, sayfa mimarisi, mevcut vs eksik özeti |
| [01-kullanici-yonetimi.md](01-kullanici-yonetimi.md) | Kullanıcı listeleme/görüntüleme, durum (pending/active/suspended) yaşam döngüsü, bölüm atama, silme neden yok — senaryolar |
| [02-rol-yonetimi.md](02-rol-yonetimi.md) | Rol CRUD, kullanıcıya rol atama/kaldırma, admin/super_admin promote-demote, tenant'a özel roller — senaryolar |
| [03-yetki-ve-claim-yonetimi.md](03-yetki-ve-claim-yonetimi.md) | Permission CRUD, rol↔yetki matrisi, kullanıcı bazlı override (`userPermissions.granted`), effective permission hesabı, cache — senaryolar |
| [04-senaryolar.md](04-senaryolar.md) | Uçtan uca birleşik senaryolar (yeni admin atama, başkanı askıya alma, tek seferlik yetki verme, rolden yetki geri çekme, tenant izolasyonu ihlali…) |
| [05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md) | Bu sayfayı tam yapabilmek için backend'de **henüz olmayan** ama gereken endpoint'ler + öneri şemaları |
| [06-rol-mimarisi-yeniden-tasarim.md](06-rol-mimarisi-yeniden-tasarim.md) | Kurumsal 9 rollük model, `admin` → `university_admin`, salt-okunur `*.view` yetkileri, tenant moderasyonu |
| [07-rutbe-ve-kapsam.md](07-rutbe-ve-kapsam.md) | **Rol rütbesi (`roles.rank`) + hiyerarşi kuralları**, self-demotion / son-admin / escalation korumaları, tenant'sız platform hesapları, kapsam-farkında `GET /admin/universities` |

---

## 1. İki bağımsız yetki katmanı (tekrar)

Bu doküman **yalnızca KATMAN A** (global RBAC) ile ilgilenir. Kulüp içi roller
(member/officer/president) yönetim panelinin konusu değildir.

```
┌────────────────────────────────────────────────────────────────────┐
│ KATMAN A — Global RBAC  →  YÖNETİM PANELİNİN KONUSU                │
│   Roller     : student, advisor, admin, super_admin (+ özel roller) │
│   Yetkiler   : user.manage, club.*, university.*, role.manage, …    │
│   Kaynak     : userRoles + rolePermissions + userPermissions        │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ KATMAN B — Kulüp içi roller  →  BU DOKÜMANIN DIŞINDA               │
│   member / officer / president  (clubMembers.role)                  │
└────────────────────────────────────────────────────────────────────┘
```

**Kritik ilişki:** Bir kullanıcının KATMAN A rolü ile KATMAN B rolü birbirinden
**tamamen bağımsızdır**. `mustafa.kurt` global olarak `student`'tır ama Yazılım
Kulübü'nde `president`'tir. Yönetim panelinde bir kullanıcıyı "admin" yapmak,
onun kulüp başkanlığını etkilemez; askıya almak da kulüp başkanlığı satırını
silmez (bkz. [01](01-kullanici-yonetimi.md) ve [04](04-senaryolar.md)).

---

## 2. Rol hiyerarşisi ve kaynağı

Roller `roles` tablosunda tutulur ve **kapalı bir liste değildir** —
`role.manage` yetkisine sahip biri runtime'da yeni rol ekleyebilir. Seed ile
gelen 4 başlangıç rolü:

| Rol | `roles.universityId` | Nasıl atanır | Tenant kapsamı |
|---|---|---|---|
| `student` | `NULL` (global) | Kayıt anında `student` domainli e-posta ile **otomatik** | — |
| `advisor` | `NULL` (global) | Kayıt anında `staff` domainli e-posta ile **otomatik** | — |
| `admin` | `NULL` (global) | `POST promote-admin` ile **manuel** | Kendi üniversitesi (tenant scope) |
| `super_admin` | `NULL` (global) | `POST promote-super-admin` ile **manuel** | **Sınırsız** (tenant scope bypass) |

> Seed'deki 4 rolün hepsi `universityId: NULL` yani **global**'dir. Şema
> `roles.universityId`'yi nullable bırakır → ileride "sadece Ege'de geçerli"
> bir özel rol tanımlanabilir. Bunun senaryosu ve eksik doğrulaması için
> bkz. [02-rol-yonetimi.md](02-rol-yonetimi.md).

**Rol ≠ Yetki.** Guard'lar rol adına değil **yetki (permission) anahtarına**
bakar. Örn. kullanıcı yönetimi endpoint'i `admin` rolünü değil `user.manage`
yetkisini arar. "admin" sadece seed'de o yetkileri taşıyan bir rol adıdır;
yetkileri runtime'da değişebilir.

---

## 3. Seed rol → yetki matrisi (başlangıç durumu)

`seed.ts`'ten birebir çıkarılmıştır. **Runtime'da değişebilir**, UI'da
hardcode edilmemelidir.

| Yetki anahtarı | `student` | `advisor` | `admin` | `super_admin` |
|---|:---:|:---:|:---:|:---:|
| `user.manage` | — | — | ✅ | ✅ |
| `club.approve` | — | — | ✅ | ✅ |
| `club.update` | — | — | ✅ | ✅ |
| `club.advisor.manage` | — | — | ✅ | ✅ |
| `club.delete` | — | — | ✅ | ✅ |
| `university.create` | — | — | — | ✅ |
| `university.update` | — | — | — | ✅ |
| `university.delete` | — | — | — | ✅ |
| `university.domain.create` | — | — | — | ✅ |
| `university.domain.update` | — | — | — | ✅ |
| `university.domain.delete` | — | — | — | ✅ |
| `university.faculty.create` | — | — | — | ✅ |
| `university.faculty.update` | — | — | — | ✅ |
| `university.faculty.delete` | — | — | — | ✅ |
| `university.department.create` | — | — | — | ✅ |
| `university.department.update` | — | — | — | ✅ |
| `university.department.delete` | — | — | — | ✅ |
| `role.manage` | — | — | — | ✅ |
| `permission.manage` | — | — | — | ✅ |

**Bu matristen çıkan çok kritik sonuçlar (panelin mimarisini belirler):**

1. **Rol ve yetki yönetimi (KATMAN A'nın kendisi) yalnızca `super_admin`
   işidir.** `role.manage` / `permission.manage` yetkilerini seed'de sadece
   `super_admin` taşır. Yani "Roller" ve "Yetkiler" sekmeleri **admin'e
   gösterilmez**, sadece sistem yönetim panelinde yer alır.
2. **Üniversite/fakülte/bölüm/domain yönetimi de yalnızca `super_admin`
   işidir** (admin'de `university.*` yetkisi yok).
3. **`admin` yalnızca kendi üniversitesinde** kullanıcı + kulüp + başvuru +
   danışman yönetebilir (5 yetki, hepsi tenant-scoped rotalarda).
4. Bir `admin`'e üniversite yönetimi de vermek istenirse: ya `admin` rolüne
   `university.*` yetkileri eklenir (o zaman **tüm** admin'ler kazanır), ya da
   o kullanıcıya kişi bazlı override verilir (bkz. [03](03-yetki-ve-claim-yonetimi.md)).

---

## 4. Effective (etkin) permission nasıl hesaplanır?

`shared/rbac/rbac.repository.ts` → `getEffectiveRolesAndPermissions(userId)`:

```
etkin_yetkiler = ( kullanıcının TÜM rollerinin yetkilerinin BİRLEŞİMİ )
                 sonra her userPermissions satırı uygulanır:
                   granted = true  → yetkiyi EKLE
                   granted = false → yetkiyi ÇIKAR (rolden geleni iptal et)
```

İlişki zinciri:

```
users ──userRoles──> roles ──rolePermissions──> permissions   (rolden gelen)
users ──userPermissions(granted:true/false)──> permissions     (kişiye özel override)
```

- Bir kullanıcı **birden fazla role** sahip olabilir (`userRoles` M:N). Yetkiler
  birleşir (union). Örn. hem `advisor` hem `admin` olan biri her ikisinin
  yetkilerini toplar.
- `userPermissions` **kişiye özel istisna** katmanıdır:
  - `granted: true` → role bakılmaksızın o kullanıcıya bir yetki **ekler**
    (örn. bir admin'e istisnai olarak `university.faculty.create`).
  - `granted: false` → rolünden gelen bir yetkiyi o kullanıcıda **iptal eder**
    (örn. bir admin'den `club.delete`'i geri al).
- Sonuç **Redis'te 5 dakika (300s) cache'lenir** (`shared/rbac/rbac.cache.ts`).
  Rol/yetki değiştiren her servis, etkilenen kullanıcı(lar)ın cache'ini
  **anında** temizler (`invalidateUserPermissions` / `invalidateUsersPermissions`).
  Yani promote/demote, role yetki ekleme/çıkarma değişiklikleri bir sonraki
  istekte geçerli olur — 5 dakika beklenmez.

> **UYARI (mevcut kısıt):** `userPermissions`'ı okuyan motor VAR ama onu
> **yazan bir endpoint YOK**. Yani "kullanıcıya tek seferlik yetki ver/al"
> özelliği bugün API'de mevcut değildir. Kişi bazlı claim yönetimi bu panelin
> ana eksiğidir — bkz. [05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md).

---

## 5. Tenant scope (çok kiracılı izolasyon)

- Her kullanıcı bir `universityId`'ye bağlıdır (`users.universityId`, denormalize).
- **Admin rotaları** (`/api/admin/universities/:universityId/...`) `enforceTenantScope`
  ile korunur: path'teki `:universityId` ≠ çağıranın kendi üniversitesi ise `403`.
  **`super_admin` bu kontrolü bypass eder** ve herhangi bir üniversiteyi hedefler.
- **Auth/RBAC rotaları** (`/api/auth/roles`, `/permissions`, `/users/:id/promote-*`)
  **tenant-scoped DEĞİLDİR** — yalnızca `role.manage`/`permission.manage` yetkisi
  arar. Bu yetki seed'de sadece `super_admin`'de olduğu için pratikte bunlar
  **sistem geneli, super_admin'e özel** işlemlerdir.

**İlişkisel dikkat (mevcut açık):** `promote-admin` bir kullanıcıya global
`admin` rolü verir ama **hangi üniversitede** admin olacağını sormaz — kullanıcı
zaten kendi `users.universityId`'sinde admin olur (tenant scope o kullanıcının
kendi üniversitesini baz alır). Yani "Ege'nin bir kullanıcısını Antalya'ya admin
yap" gibi bir şey **mümkün değildir**; admin daima kendi tenant'ının admini olur.
super_admin ise tenant'sızdır (her yeri yönetir). Senaryosu için bkz.
[02-rol-yonetimi.md](02-rol-yonetimi.md) ve [04](04-senaryolar.md).

---

## 6. Yönetim panelinin bilgi mimarisi (önerilen)

Rol matrisine göre panel **iki farklı yetki seviyesinde** iki farklı yüz gösterir:

### A) Sistem Yönetim Paneli — `super_admin`
- **Üniversiteler** — üniversite/domain/fakülte/bölüm CRUD (`university.*`)
- **Roller** — rol CRUD + rol↔yetki matrisi (`role.manage`)
- **Yetkiler (Claims)** — permission kataloğu CRUD (`permission.manage`)
- **Kullanıcılar (global)** — herhangi bir tenant'taki kullanıcı; rol atama,
  admin/super_admin yapma
- (+ admin'in gördüğü her şey, tüm üniversiteler için)

### B) Okul Yönetim Paneli — `admin` (yalnızca kendi üniversitesi)
- **Kullanıcılar** — listele/filtrele, durum değiştir, bölüm ata (`user.manage`)
- **Kulüpler** — durum/profil/silme (`club.update`, `club.delete`)
- **Başvurular** — kulüp kurma başvurularını onayla/reddet (`club.approve`)
- **Danışmanlar** — kulüplere danışman ata/kaldır (`club.advisor.manage`)

> UI göster/gizle kararı: mümkünse **yetki anahtarına** bakın. Etkin permission
> listesini dışarı veren endpoint henüz olmadığından, o gelene kadar geçici
> olarak **rol adına** bakılır (`super_admin` → sistem paneli, `admin` → okul
> paneli). Bunu tek bir yardımcıda toplayın — bkz.
> [05](05-eksikler-ve-onerilen-endpointler.md) (öneri #1).

---

## 7. Mevcut vs Eksik — hızlı özet

> **GÜNCELLEME (Temmuz 2026):** [05](05-eksikler-ve-onerilen-endpointler.md)'te
> önerilen 8 maddenin **#7 hariç 7'si uygulandı ve canlı sunucuda doğrulandı.**
> Aşağıdaki tablo güncel durumu yansıtır. Yeni endpoint'lerin tam referansı için
> bkz. [05 — "Uygulanan endpoint'ler"](05-eksikler-ve-onerilen-endpointler.md).

| İşlev | Durum | Endpoint / Not |
|---|:---:|---|
| Kullanıcıları listele/filtrele (tenant) | ✅ | `GET /api/admin/universities/:uid/users?status=&role=` (artık `role` filtresi + her satırda `roles`) |
| Tek kullanıcı detayı (tenant) | ✅ | `GET .../users/:userId` → roller + kulüp üyelikleri + `permissionOverrides` + `effectivePermissions` |
| Kullanıcı durumu değiştir | ✅ | `PATCH .../users/:userId/status` (kendini askıya alma engelli) |
| Kullanıcı bölümü değiştir | ✅ | `PATCH .../users/:userId/department` |
| Kullanıcıyı admin yap / geri al | ✅ | `PATCH /api/auth/users/:userId/promote-admin` … |
| Kullanıcıyı super_admin yap / geri al | ✅ | `PATCH /api/auth/users/:userId/promote-super-admin` … (son super_admin korumalı) |
| Rol oluştur / listele / güncelle | ✅ | `POST\|GET\|PATCH /api/auth/roles` (çekirdek rol adı değişmez) |
| Role yetki ekle / kaldır | ✅ | `POST\|DELETE /api/auth/roles/:roleId/permissions` |
| Yetki (permission) oluştur / listele / güncelle | ✅ | `POST\|GET\|PATCH /api/auth/permissions` |
| **Kullanıcıya genel rol ata / kaldır / listele** | ✅ **YENİ** | `POST\|DELETE\|GET /api/auth/users/:userId/roles` |
| **Kişi bazlı yetki ver/al/listele** (`userPermissions`) | ✅ **YENİ** | `POST\|DELETE\|GET /api/auth/users/:userId/permissions` |
| **Effective yetkileri görme** (self + yönetici) | ✅ **YENİ** | `GET /api/users/me/permissions` · `GET /api/admin/.../users/:userId/effective-permissions` |
| **Rol silme / yetki silme** | ✅ **YENİ** | `DELETE /api/auth/roles/:roleId` · `DELETE /api/auth/permissions/:permissionId` (çekirdekler korumalı) |
| **Role/yetkiye sahip olanları listeleme** | ✅ **YENİ** | `GET /api/auth/roles/:roleId/users` · `GET /api/auth/permissions/:permissionId/roles` |
| Askıya alma → **anlık** erişim kesme (JWT) | ❌ (#7) | Hâlâ eksik — mimari karar; token süresi dolana dek erişim sürer |
| Kullanıcı **silme** | ❌ (kasıtlı) | FK ağı nedeniyle desteklenmez → askıya al |

Kalan tek madde (#7) ve tüm uygulanan endpoint'lerin referansı:
[05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md).
