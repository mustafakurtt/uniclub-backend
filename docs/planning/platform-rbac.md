# Platform RBAC — Rol ve Yetki Tasarımı

**Kapsam:** SaaS operatör paneli (`/platform`) için rol sayısı, rütbe hiyerarşisi
ve yeni permission anahtarları. Tenant (okul) rolleri bu dokümanın dışındadır.

**İlgili:** [design/07-rutbe-ve-kapsam.md](../design/07-rutbe-ve-kapsam.md) ·
[platform-ops-roadmap.md](platform-ops-roadmap.md) · `src/db/rbac-catalog.ts`

---

## 1. Temel ilke: az rol, çok yetki

Sistem zaten **claim (permission) bazlı**. Rol = **yetki demeti** (bundle); kapalı liste değil.

| Yaklaşım | Ne zaman |
| --- | --- |
| **Yeni permission** | Yeni bir aksiyon / API yüzeyi |
| **Yeni rol** | Aynı departmanda tekrar tekrar atanan **sabit demet** |
| **Kişisel override** (`userPermissions`) | Geçici istisna, tek kişi |

**Yapmayın:** Her modül için ayrı rol (`tenant_viewer`, `club_viewer` …) — UI'da
`can("club.view")` kullanın.

---

## 2. 9 rol vs 2 platform rolü (önemli ayrım)

Seed / `ROLE_DEFS` **9 kurumsal rol** tanımlar; bunların **yalnızca 2'si platform katmanı**:

| Platform (hesap `universityId = null`) | Tenant (hesap tenant'a bağlı) |
| --- | --- |
| `super_admin`, `platform_support` | `university_admin`, `student_affairs`, `academic_affairs`, `content_moderator`, `auditor`, `advisor`, `student` |

`content_moderator` / `auditor` tenant personeli içindir — platform layout menüsünde rol olarak düşünülmez.
`super_admin` drill-down'da tenant API'lerini bypass ile kullanır; tenant rolü taşıması gerekmez.

Tasarımda öngörülen ama seed'de **henüz yok:** `call_center` (bypass'sız platform hesabı).

---

## 3. Kaç platform rolü?

### Şimdi (Faz 0–3): **2 rol — yeterli**

| Rol | rank | Açıklama |
| ---: | --- | --- |
| `super_admin` | 100 | Tam yetki — platform + tüm tenant |
| `platform_support` | 90 | Salt-okunur, çapraz-tenant (`*.view` + audit) |

Bu ikisi MVP platform panelini (tenant listesi, drill-down destek, global RBAC) kapsar.

### Ürün büyüdükçe: **toplam 4–5 platform rolü** (önerilen üst sınır)

| Rol | rank | Ne zaman ekle | Özet demet |
| ---: | --- | --- | --- |
| `super_admin` | 100 | Var | Tüm yetkiler |
| `platform_support` | 90 | Var | Tüm `*.view` + `audit.view`, yazma yok |
| `platform_operator` | 85 | Tenant onboarding operasyonu ayrı kişide | Tenant aç/suspend, davet; global RBAC **yok** |
| `billing_admin` | 82 | Faz 5 (billing) | Plan/abonelik/kota |
| `compliance_officer` | 80 | Faz 6 (KVKK) | Audit aggregate, export; yazma yok |

**Eklemeyin (şimdilik):**

- `call_center` — `platform_support` + gelecekte sınırlı `user.manage` override yeterli
- Modül bazlı platform rolleri — permission ile çözün
- Tenant rolleri platform paneline taşımayın (`university_admin` platformda kullanılmaz)

---

## 4. Rütbe haritası (platform + tenant katmanı)

```
100  super_admin
 90  platform_support
 85  platform_operator      ← gelecek
 82  billing_admin          ← gelecek
 80  compliance_officer     ← gelecek
 ── tenant katmanı ──
 60  university_admin
 45  student_affairs / academic_affairs
 30  content_moderator / auditor
 20  advisor
 10  student
```

Platform rolleri arasında **10+ boşluk** bırakıldı — ara kademe eklenebilir.

---

## 5. Mevcut platform yetkileri (bugün)

Seed'de platform seviyesi sayılanlar (`auth.service.ts` — tenant rolüne atanamaz):

| Permission | Açıklama |
| --- | --- |
| `university.create` | Tenant oluştur |
| `university.delete` | Tenant sil |
| `role.manage` | Rol kataloğu (global anlamda super_admin) |
| `permission.manage` | Yetki kataloğu + kişisel override |
| `platform.tenant.view` | Tenant listesi + özet istatistikler |
| `platform.tenant.manage` | Tenant durumu (suspend/reactivate) |
| `platform.tenant.invite` | İlk admin davet / provision |
| `platform.user.view` | Platform hesap listesi (salt-okunur) |

`super_admin` seed'de **tüm** yetkileri alır. `platform_support` yalnızca view demeti + `platform.tenant.view`.

Platform hesabı **oluşturma** ayrı permission değil — `POST /api/platform/users` yalnızca `super_admin` rolüyle korunur (platform rolleri yalnızca super_admin atar).

---

## 6. Gelecek platform permission'ları (fazlarla)

| Permission | Faz | Açıklama |
| --- | --- | --- |
| `platform.dashboard.view` | 4 | Aggregate platform dashboard |
| `platform.audit.view` | 4 | Cross-tenant audit aggregate |
| `billing.view` | 5 | Plan/abonelik okuma |
| `billing.manage` | 5 | Plan atama, kota |
| `compliance.export` | 6 | KVKK/export işlemleri |

---

## 7. Rol → yetki demetleri (hedef)

### `super_admin` (100)

Tüm katalog — değişmez.

### `platform_support` (90) — mevcut

```
user.view, club.view, application.view, dashboard.view, audit.view
platform.tenant.view
(+ platform.dashboard.view, platform.audit.view gelecekte)
```

Yazma yok. Frontend: `isReadOnly = true`.

### `platform_operator` (85) — gelecek

```
university.create
platform.tenant.manage
platform.tenant.invite
platform.dashboard.view
user.view, club.view, application.view
audit.view
```

**Yok:** `role.manage`, `permission.manage`, `university.delete`, `billing.manage`,
platform hesabı oluşturma (super_admin işi).

### `billing_admin` (82) — gelecek

```
billing.view, billing.manage
platform.dashboard.view (kullanım widget'ları)
user.view (salt-okunur müşteri bağlamı)
```

### `compliance_officer` (80) — gelecek

```
audit.view, platform.audit.view
compliance.export
user.view (salt-okunur)
```

---

## 8. Teknik kısıtlar (yeni rol eklerken)

Yeni **platform rolü** kodda dört yere işlenmeli:

| Yer | Dosya | Ne |
| --- | --- | --- |
| Rol tanımı + demet | `src/db/rbac-catalog.ts` | `ROLE_DEFS`, `ROLE_BUNDLES` |
| Platform rol seti | `src/features/auth/auth.service.ts` | `PLATFORM_ROLE_NAMES` — yalnızca `super_admin` atayabilir |
| Tenant bypass | `src/index.ts` | `bypassRoles` — çapraz-tenant drill-down için |
| Rank backfill | `src/db/rbac-catalog.ts` | `ROLE_DEFS` (`provisionRbacCatalog`) |

`roles.universityId` platform rolleri için `NULL` (global şablon).

Platform hesapları: `users.universityId = NULL`.

---

## 9. Karar özeti

| Soru | Cevap |
| --- | --- |
| Kaç rol şimdi? | **2** (`super_admin`, `platform_support`) |
| Uzun vadede max? | **4–5** platform rolü |
| Granülerlik nerede? | **Permission** + istisna için `userPermissions` |
| Tenant rolleri platformda? | Hayır — ayrı layout, ayrı kullanıcı sınıfı |
| Her yeni özellik = yeni rol? | Hayır — önce permission, demet tekrar ederse rol |
