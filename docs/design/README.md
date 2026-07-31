# Yönetim Paneli — Kullanıcı / Rol / Yetki (Claim) Senaryoları

**Kapsam:** Yönetim sayfasının (platform + tenant panelleri) kullanıcı yönetimi,
rol yönetimi ve yetki (claim/permission) yönetimi işlevlerinin **tamamının**
senaryolarla, ilişki yapıları göz önünde bulundurularak dökümante edilmesi.

> Bu doküman kod tabanından birebir doğrulanmıştır (`schema.ts`, `relations.ts`,
> `seed.ts`, `auth.*`, `admin.*`, `moderation.*`, `core/rbac/*`, `shared/rbac/*`
> — Temmuz 2026). Tüm backend mesajları **Türkçedir** ve UI'da doğrudan
> gösterilebilir.

Bu klasör uzun olduğu için dosyalara bölünmüştür:

| Dosya | İçerik |
|---|---|
| **README.md** (bu dosya) | Genel model, rol hiyerarşisi, iki katman, effective permission, tenant scope, rol→yetki matrisi, sayfa mimarisi, mevcut vs eksik özeti |
| [01-kullanici-yonetimi.md](01-kullanici-yonetimi.md) | Kullanıcı listeleme/görüntüleme, durum (pending/active/suspended) yaşam döngüsü, bölüm atama, silme neden yok — senaryolar |
| [02-rol-yonetimi.md](02-rol-yonetimi.md) | Rol CRUD, kullanıcıya rol atama/kaldırma, promote/demote, tenant'a özel roller — senaryolar |
| [03-yetki-ve-claim-yonetimi.md](03-yetki-ve-claim-yonetimi.md) | Permission CRUD, rol↔yetki matrisi, kullanıcı bazlı override (`userPermissions.granted`), effective permission hesabı, cache — senaryolar |
| [04-senaryolar.md](04-senaryolar.md) | Uçtan uca birleşik senaryolar (yeni admin atama, başkanı askıya alma, tek seferlik yetki verme, rolden yetki geri çekme, tenant izolasyonu ihlali…) |
| [05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md) | Tarihsel: paneli tamamlamak için önerilen endpoint'ler (çoğu uygulandı) |
| [06-rol-mimarisi-yeniden-tasarim.md](06-rol-mimarisi-yeniden-tasarim.md) | Kurumsal 9 rollük model, `admin` → `university_admin`, salt-okunur `*.view` yetkileri, tenant moderasyonu |
| [07-rutbe-ve-kapsam.md](07-rutbe-ve-kapsam.md) | **Rol rütbesi (`roles.rank`) + hiyerarşi kuralları**, self-demotion / son-admin / escalation korumaları, tenant'sız platform hesapları, kapsam-farkında `GET /admin/universities` |
| [08-aday-soru-platformu.md](08-aday-soru-platformu.md) | 🟡 **TASARIM (uygulanmadı)** — Tanıtım günleri soru-cevap platformu: tenant'sız **aday** kullanıcı sınıfı, `user_identities` ile kimlik temeli, `candidate`/`admission_rep` rolleri, ilk **auth'suz public** yüzey, moderasyon politikası, aday→öğrenci dönüşümü |
| [archive/](archive/) | Eski 4-rollük README bölümlerinin tarihsel kaydı |

---

## 1. İki bağımsız yetki katmanı (tekrar)

Bu doküman **yalnızca KATMAN A** (global RBAC) ile ilgilenir. Kulüp içi roller
(member/officer/president) yönetim panelinin konusu değildir.

```
┌────────────────────────────────────────────────────────────────────┐
│ KATMAN A — Global RBAC  →  YÖNETİM PANELİNİN KONUSU                │
│   Roller     : 9 kurumsal rol (+ tenant'a özel özel roller)       │
│   Yetkiler   : user.*, club.*, university.*, audit.view, …        │
│   Kaynak     : userRoles + rolePermissions + userPermissions        │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ KATMAN B — Kulüp içi roller  →  BU DOKÜMANIN DIŞINDA               │
│   member / officer / president  (clubMembers.role)                  │
└────────────────────────────────────────────────────────────────────┘
```

**Kritik ilişki:** Bir kullanıcının KATMAN A rolü ile KATMAN B rolü birbirinden
**tamamen bağımsızdır**. `mustafa.kurt` global olarak `student`'tır ama Yazılım
Kulübü'nde `president`'tir. Yönetim panelinde bir kullanıcıyı `university_admin`
yapmak, onun kulüp başkanlığını etkilemez; askıya almak da kulüp başkanlığı
satırını silmez (bkz. [01](01-kullanici-yonetimi.md) ve [04](04-senaryolar.md)).

---

## 2. Rol hiyerarşisi ve kaynağı

Roller `roles` tablosunda tutulur; **kapalı bir liste değildir** — uygun
`role.manage` yetkisine sahip biri runtime'da yeni rol ekleyebilir (platform
veya tenant kapsamında). Seed ile gelen **9 kurumsal rol** ve rütbeleri:

| Rol | `rank` | `roles.universityId` | Kapsam |
|---|---:|---|---|
| `super_admin` | 100 | `NULL` (global) | Platform — tüm yetkiler |
| `platform_support` | 90 | `NULL` (global) | Platform — salt-okunur (`*.view`) |
| `university_admin` | 60 | global şablon | Tenant — tam yönetim |
| `academic_affairs` | 45 | global şablon | Tenant — akademik yapı + bölüm |
| `student_affairs` | 45 | global şablon | Tenant — kulüp/başvuru moderasyonu |
| `content_moderator` | 30 | global şablon | Tenant — içerik moderasyonu |
| `auditor` | 30 | global şablon | Tenant — salt-okunur denetim |
| `advisor` | 20 | global şablon | Tenant — danışmanlık etiketi |
| `student` | 10 | global şablon | Tenant — temel öğrenci rolü |

Kaynak: `db/seed.ts` `roleDefs`. Rütbe kuralları ve escalation korumaları:
[07-rutbe-ve-kapsam.md](07-rutbe-ve-kapsam.md).

**Nasıl atanır:**
- `student` / `advisor` → kayıt anında e-posta domain tipine göre **otomatik**
  (`student` / `staff` domain).
- Diğer roller → `POST /api/auth/users/:userId/roles` veya promote/demote
  sarmalayıcıları (`promote-admin` → `university_admin` atar; geriye uyumluluk
  için endpoint adı korunur).
- Tenant'a özel roller → `roles.universityId = <tenant>` ile oluşturulur;
  `university_admin` kendi tenant'ının rollerini yönetebilir (bkz. [02](02-rol-yonetimi.md)).

**Rol ≠ Yetki.** Guard'lar rol adına değil **yetki (permission) anahtarına**
bakar. "university_admin" sadece seed'de belirli yetkileri taşıyan bir rol adıdır;
yetkileri runtime'da değişebilir.

> Eski 4-rollük model (`admin`/`super_admin` matrisi) arşivde:
> [archive/README-eskimiş-bölümler.md](archive/README-eskimiş-bölümler.md).

---

## 3. Seed rol → yetki matrisi (başlangıç durumu)

`seed.ts` `ROLE_BUNDLES`'dan çıkarılmıştır. **Runtime'da değişebilir**, UI'da
hardcode edilmemelidir. Tam liste ve uygulama notları: [06 §B4](06-rol-mimarisi-yeniden-tasarim.md).

| Yetki | super_admin | platform_support | university_admin | student_affairs | academic_affairs | content_moderator | auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `university.create` / `delete` | ✅ | — | — | — | — | — | — |
| `role.manage` / `permission.manage` | ✅ | — | (tenant) | — | — | — | — |
| `university.update` | ✅ | — | ✅ | — | — | — | — |
| `university.faculty.*` / `department.*` / `domain.*` | ✅ | — | ✅ | — | ✅ | — | — |
| `user.view` | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| `user.manage` | ✅ | — | ✅ | — | ✅ | — | — |
| `audit.view` | ✅ | ✅ | ✅ | — | — | — | ✅ |
| `club.view` / `application.view` | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| `club.approve` / `update` / `advisor.manage` | ✅ | — | ✅ | ✅ | — | — | — |
| `club.member.manage` | ✅ | — | ✅ | ✅ | — | — | — |
| `club.delete` | ✅ | — | ✅ | — | — | — | — |
| `announcement.moderate` / `gallery.moderate` | ✅ | — | ✅ | ✅ | — | ✅ | — |

`student` ve `advisor` seed'de ek global yetki taşımaz (`advisor` danışman atama
şartı için etiket rolüdür). `advisor`/`student` satırları tabloda yer kazanmak
için gösterilmemiştir.

**Bu matristen çıkan kritik sonuçlar (panelin mimarisini belirler):**

1. **Platform rol/katalog yönetimi** (`role.manage` / `permission.manage` global
   anlamda) yalnızca `super_admin` işidir. Tenant yöneticisi kendi tenant'ının
   rollerini yönetir ama platform yetkilerini role bağlayamaz.
2. **Salt-okunur roller mümkündür** (`auditor`, `platform_support`) — GET
   route'ları `*.view` ister, yazma `*.manage` ister (bkz. [06 §A1](06-rol-mimarisi-yeniden-tasarim.md)).
3. **`university_admin` kendi tenant'ında** kullanıcı + kulüp + başvuru +
   akademik yapı + moderasyon yönetebilir; üniversite onboard/offboard yalnızca
   platform seviyesindedir.
4. Granüler yetki vermek için rol matrisi **veya** kişi bazlı override
   (`userPermissions`) kullanılır — bkz. [03](03-yetki-ve-claim-yonetimi.md).

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
  birleşir (union).
- `userPermissions` **kişiye özel istisna** katmanıdır (`granted: true` ekler,
  `granted: false` rolden geleni iptal eder).
- Sonuç **Redis'te 5 dakika (300s) cache'lenir** (`shared/rbac/rbac.cache.ts`).
  Cache'e `status` ve `maxRank` da gömülür. Rol/yetki/durum değiştiren her servis
  etkilenen kullanıcı(lar)ın cache'ini **anında** temizler
  (`invalidateUserPermissions` / `invalidateUsersPermissions`).

**Dışa veren endpoint'ler:**
- Self: `GET /api/users/me/permissions` → `{ roles, permissions, status }`
- Yönetici: `GET /api/admin/universities/:uid/users/:userId/effective-permissions`
- Kişisel override yazma: `POST|DELETE /api/auth/users/:userId/permissions`

---

## 5. Tenant scope (çok kiracılı izolasyon)

İki kullanıcı türü vardır (`users.universityId`):

| `universityId` | Tür | Davranış |
|---|---|---|
| `NULL` | **Platform hesabı** | Şirket çalışanı; tenant'a bağlı değil. `super_admin` / `platform_support` tenant scope'u **rolüyle** bypass eder (`TENANT_SCOPE_BYPASS_ROLES`). |
| dolu | **Tenant kullanıcısı** | Öğrenci/personel. Kayıt akışı tenant'ı e-posta domain'inden çıkarır. |

**Tenant-scoped rotalar** (`/api/admin/universities/:universityId/...`,
`/api/moderation/universities/:universityId/...`, `/api/audit/universities/:universityId`)
`enforceTenantScope` ile korunur: path'teki `:universityId` ≠ çağıranın kendi
üniversitesi ise `403`. **`super_admin` ve `platform_support` bypass eder.**

**Kapsam-farkında üniversite listesi:** Panel, global `GET /api/universities`
(kayıt formu, public) yerine `GET /api/admin/universities` kullanmalıdır —
aktörün yönetim bağlamında görebildiği üniversiteleri döner (platform rolü →
hepsi; tenant kullanıcısı → yalnızca kendi; bypass'sız platform hesabı → hiçbiri).
Ayrıntı: [07 §C](07-rutbe-ve-kapsam.md).

**Auth/RBAC rotaları** (`/api/auth/roles`, `/permissions`, `/users/:id/roles`)
çoğunlukla **tenant-scoped değildir** — `role.manage` / `permission.manage`
arar. `university_admin` kendi tenant'ının rollerini yönetirken `auth.service.ts`
çapraz-tenant ve yetki-yükseltme deliklerini kapatır (`assertRole*`,
`assertUserInTenant`).

**Askıya alma ve anlık erişim:** `status` authz cache'ine gömülüdür.
`attachAuthz` (guard zinciri) ve `requireActiveUser` (self-service/kulüp rotaları)
`suspended` hesabı **bir sonraki istekte** `403` ile keser. JWT hâlâ 7 günlük
stateless'tır; logout/şifre değişimi diğer oturumları öldürmez — bkz.
[GUVENLIK_YOL_HARITASI.md §1.3](../GUVENLIK_YOL_HARITASI.md).

---

## 6. Yönetim panelinin bilgi mimarisi (önerilen)

Rol matrisine göre panel **üç yüz** gösterir:

### A) Platform Yönetim Paneli — `super_admin`
- **Üniversiteler** — onboard/offboard (`university.create`/`delete`)
- **Global rol/katalog** — `role.manage`, `permission.manage`
- **Kullanıcılar (global)** — herhangi bir tenant + platform hesapları
- Tüm tenant panellerinin içeriği (çapraz-tenant)

### B) Platform Destek — `platform_support`
- Salt-okunur: tüm `*.view` + `audit.view`, yazma yok
- Çapraz-tenant görünürlük (bypass)

### C) Okul Yönetim Paneli — tenant rolleri (`university_admin`, `student_affairs`, …)
- **Kullanıcılar** — listele (`user.view`), bölüm (`user.manage`), ban/unban
  (`/api/moderation`)
- **Kulüpler / başvurular / danışmanlar** — yetki demetine göre
- **Akademik yapı** — `academic_affairs` / `university_admin`
- **Denetim izi** — `audit.view` (`GET /api/audit/universities/:uid`)

> UI göster/gizle kararı: **`GET /api/users/me/permissions`** ile gelen
> `permissions` dizisine bakın (`permissions.includes("<key>")`). Rol adına
> yalnızca tenant seçici gibi az sayıda kararda bakılır (`super_admin` /
> `platform_support` → çapraz-tenant). Frontend rehberi:
> [FRONTEND_YONETIM.md](../frontend/FRONTEND_YONETIM.md).

---

## 7. Mevcut vs Eksik — hızlı özet

| İşlev | Durum | Endpoint / Not |
|---|:---:|---|
| Kullanıcıları listele/filtrele (tenant) | ✅ | `GET /api/admin/universities/:uid/users?status=&role=` (`user.view`; satırda `roles`) |
| Tek kullanıcı detayı (tenant) | ✅ | `GET .../users/:userId` → roller, kulüp üyelikleri, override'lar, effective |
| Kullanıcı ban / unban (sebepli) | ✅ | `POST /api/moderation/universities/:uid/users/:userId/ban\|unban` (`user.manage`) |
| Kullanıcı bölümü değiştir | ✅ | `PATCH .../users/:userId/department` |
| Şifre sıfırlama (geçici şifre) | ✅ | `POST /api/moderation/.../reset-password` |
| Kullanıcıyı university_admin yap / geri al | ✅ | `PATCH /api/auth/users/:userId/promote-admin` / `demote-admin` |
| Kullanıcıyı super_admin yap / geri al | ✅ | `PATCH /api/auth/users/:userId/promote-super-admin` / `demote-super-admin` |
| Genel rol ata / kaldır / listele | ✅ | `POST\|DELETE\|GET /api/auth/users/:userId/roles` |
| Kişi bazlı yetki ver/al/listele | ✅ | `POST\|DELETE\|GET /api/auth/users/:userId/permissions` |
| Effective yetkileri görme | ✅ | `GET /api/users/me/permissions` · `GET .../effective-permissions` |
| Rol / yetki CRUD + silme | ✅ | `/api/auth/roles`, `/api/auth/permissions` (+ DELETE, çekirdekler korumalı) |
| Denetim izi görüntüleme | ✅ | `GET /api/audit/universities/:uid` (`audit.view`, cursor sayfalama) |
| Askıya alma → anlık erişim kesme | ✅ | `attachAuthz` + `requireActiveUser` (authz cache'deki `status`) |
| Kullanıcı **silme** | ❌ (kasıtlı) | FK ağı nedeniyle desteklenmez → ban/askı |
| Logout / token revocation (tüm oturumlar) | ❌ | JWT stateless — bkz. GUVENLIK_YOL_HARITASI §1.3 |

Uygulanan endpoint'lerin tarihsel öneri metinleri:
[05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md).
