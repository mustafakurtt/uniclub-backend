# 06 — Rol / Yetki Mimarisi: Eleştiri ve Kurumsal Yeniden Tasarım

Mevcut model 4 düz rol (`student/advisor/admin/super_admin`) üzerine kuruluydu.
Gerçek bir SaaS/üniversite yapısı için bu fazla basit ve bazı route guard'ları
**semantik olarak yanlıştı**. Bu doküman: (A) eski modelin koddan doğrulanmış
eleştirisi, (B) kurumsal taksonomi, (C) uygulama planı.

> Grounded: `seed.ts`, `*.permissions.ts`, tüm `*.routes.ts`, `club.middleware.ts`,
> `rbac.*` okunarak yazıldı (Temmuz 2026).

---

## ✅ UYGULANDI (Temmuz 2026) — canlı DB'de doğrulandı

Aşağıdaki **B ve C bölümlerinin tamamı koda geçirildi** ve seed + canlı sunucu
üzerinde uçtan uca test edildi:

- **9 rol** kuruldu: `super_admin`, `platform_support`, `university_admin`,
  `student_affairs`, `academic_affairs`, `content_moderator`, `auditor`,
  `advisor`, `student` (rol→yetki demetleri: `seed.ts` `ROLE_BUNDLES`).
- **`admin` → `university_admin`** olarak yeniden adlandırıldı (kod sabitleri,
  seed, promote/demote hedefi, CORE_ROLE_NAMES güncellendi).
- **6 yeni yetki**: `user.view`, `club.view`, `application.view`,
  `club.member.manage`, `announcement.moderate`, `gallery.moderate`.
- **Guard düzeltmeleri (A1)**: admin GET route'ları artık `*.view` ister
  (yazma değil) → salt-okunur `auditor`/`platform_support` mümkün.
- **Moderasyon route'ları (A6)**: `DELETE .../clubs/:id/members/:uid`
  (`club.member.manage`), `.../announcements/:aid` (`announcement.moderate`),
  `.../gallery/:gid` (`gallery.moderate`) + `GET .../clubs/:id/members`.
- **Tenant-scoped rol yönetimi (A5)**: `university_admin` kendi tenant'ının
  rollerini oluşturur/atar. Yetki-yükseltme delikleri kapalı: platform rolleri
  (super_admin/platform_support) atanamaz, platform yetkileri
  (university.create/delete, role.manage, permission.manage) tenant rolüne
  eklenemez, global roller tenant yöneticisi tarafından düzenlenemez, çapraz-tenant
  atama engellenir (`auth.service.ts` `assertRole*`/`assertUserInTenant`).
- **`platform_support`** tenant-scope bypass'ına eklendi (çapraz-tenant salt-okunur).
- **Askı anında kesme (#7)** eklendi (bkz. [05](05-eksikler-ve-onerilen-endpointler.md)).

**Seed demo hesapları** (hepsi `Password123!`, Antalya): `sks@antalya.edu.tr`
(student_affairs), `denetci@antalya.edu.tr` (auditor), `ogrenci.isleri@antalya.edu.tr`
(academic_affairs), `moderator@antalya.edu.tr` (content_moderator),
`destek@antalya.edu.tr` (platform_support), `elif.demir@antalya.edu.tr`
(university_admin). Ege'de ayrıca `sks@egebilim.edu.tr` (tenant izolasyon testi).

**Uygulanan rol→yetki demetleri `seed.ts` `ROLE_BUNDLES`'da** — aşağıdaki §B4
matrisi bu demetlerin kaynağıdır.

> Not (faculty-scope): §B3'teki Dekan/Bölüm Başkanı (fakülte-bazlı kapsam) hâlâ
> bilinçli olarak ertelendi — RBAC'a fakülte kapsamı eklemek ayrı bir adımdır.

### ➡️ Devamı: [07 — Rol Rütbesi ve Tenant'sız Platform Hesapları](07-rutbe-ve-kapsam.md)

Bu dokümanın bıraktığı iki yapısal boşluk sonraki turda kapatıldı:

- **`roles.rank` (yetki derecesi)** + "kendinden düşük rütbe" kuralı → bir
  `university_admin` artık kendi rolünü sökemez, eşit rütbeli bir admini görevden
  alamaz, kendinden güçlü rol üretip kendine atayamaz; kendinde bulunmayan bir
  yetkiyi hiçbir role bağlayamaz.
- **`users.universityId` nullable** → `super_admin` / `platform_support` (ve
  ileride call center, sistem moderatörü gibi roller) hiçbir üniversiteye bağlı
  olmayan **platform hesapları** oldu. Yeni `GET /admin/universities`, aktörün
  kapsamına göre üniversite listesi döner.
- **Son yönetici koruması** `super_admin`'den `university_admin`'e genişletildi
  (bir tenant yönetimsiz kalamaz).

Bölge (region) kapsamı hâlâ ertelenmiş durumda — bkz. [07 §D](07-rutbe-ve-kapsam.md).

---

## A. Mevcut modelin sorunları (koddan doğrulanmış)

### A1. Okuma (GET), yazma yetkisinin arkasında — YANLIŞ guard'lar

| Route | Şu anki guard | Sorun |
|---|---|---|
| `GET /admin/.../clubs` | `club.update` | Kulüpleri **görüntülemek** için **güncelleme** yetkisi isteniyor |
| `GET /admin/.../clubs/:id/advisors` | `club.advisor.manage` | Danışman **listesini görmek** için **yönetme** yetkisi |
| `GET /admin/.../club-applications` | `club.approve` | Başvuruları **görmek** için **karar** yetkisi |
| `GET /admin/.../users`, `.../users/:id` | `user.manage` | Görüntüleme + değiştirme aynı tek yetkide |

**Sonuç:** Sisteme "yalnızca izleyen" (denetçi, dekan, rektör yardımcısı,
teknik destek) hiçbir rol tanımlanamıyor — her okuma bir yazma yetkisi gerektiriyor.
Kurumsal panolar (dashboard) için **salt-okunur** roller imkânsız.

### A2. Roller düz ve kaba — granülerlik dekoratif

Seed'de yalnızca iki "dolu" rol var: `admin` (5 yetki) ve `super_admin` (19).
`university.*` gibi 12 granüler yetki TANIMLI ama **hiçbir rol bunların bir
alt kümesini kullanmıyor** — yani granülerlik boşa duruyor. Gerçekte gereken
ayrımlar yok:

- Yalnızca **kulüp başvurusu onaylayan + danışman atayan** (SKS / Öğrenci
  Kulüpleri Koordinatörlüğü) ama kullanıcı askıya alamayan / akademik yapı
  silemeyen biri.
- Yalnızca **fakülte/bölüm/domain yöneten** (Öğrenci İşleri / BİDB) biri.
- Yalnızca **içerik denetleyen** (duyuru/galeri moderasyonu) biri.
- **Salt-okunur denetçi**.

Bugün "admin" ya hepsine sahip ya hiçbirine — ara kademe yok.

### A3. `admin` kendi tenant'ının akademik yapısını yönetemiyor

`university.faculty.*`, `university.department.*`, `university.domain.*` yetkileri
**yalnızca `super_admin`'de**. Oysa bu route'lar zaten `tenantScoped` — yani
`admin`'e verilseydi otomatik olarak kendi üniversitesiyle sınırlı kalırdı.
Şu an her üniversitenin fakülte/bölüm verisini **SaaS operatörü (super_admin)**
giriyor — operasyonel olarak yanlış. Tenant'ın kendi yöneticisi yapmalı; yalnızca
**platform işleri** (üniversite oluştur/sil) operatörde kalmalı.

### A4. `advisor` rolü içi boş (0 yetki)

`advisor`, hiçbir permission taşımayan bir "yetenek etiketi": tek işlevi
`admin.service.addAdvisor`'ın "danışman atanacak kişi advisor rolünde olmalı"
kontrolünü geçmek. RBAC rolü gibi görünüp RBAC'ta hiçbir şey yapmaması kafa
karıştırıcı (ama işlevi meşru — bkz. öneri).

### A5. Tenant kendi rollerini tanımlayamıyor

`roles.universityId` şeması tenant'a özel rol destekliyor AMA:
- `role.manage` yalnızca `super_admin`'de,
- rol yönetim route'ları `tenantScoped` **değil**,
- rol **atama** akışı yalnızca global rolleri görüyor (bkz. [02 §2](02-rol-yonetimi.md)).

→ Bir üniversite kendi "Etkinlik Koordinatörü" rolünü **oluşturup atayamaz**.
SaaS için ciddi kısıt.

### A6. Kulüp içeriği üzerinde tenant denetimi yok

Duyuru/galeri/üyelik **yalnızca kulüp-içi rollerle** (officer/president/advisor)
yönetiliyor. Bir üniversite yöneticisi/moderatörü, uygunsuz bir duyuruyu
**hiçbir kulüpte** kaldıramaz, sorunlu bir üyeyi çıkaramaz — ne permission ne
route var. Kurumsal moderasyon/override eksik.

### A7. İki katman doğru ama köprü yok

Kulüp-içi katman (member/officer/president) meşru şekilde ayrı — bu **korunmalı**.
Eksik olan: tenant-seviyesi yetkilerin (moderasyon) kulüp katmanına **üstten
müdahale** edebilmesi.

---

## B. Önerilen kurumsal model

### B1. Tasarım ilkeleri

1. **`resource.action` + görünürlük ayrımı:** her kaynakta en az `view` ve
   mutasyon (`manage` ya da `create/update/delete`) ayrı → salt-okunur roller
   mümkün olur.
2. **Üç kapsam (scope), route + rol ile ifade edilir** (yeni kolon gerekmez):
   - **platform** (global, tenant'sız): üniversite oluştur/sil, global rol/katalog.
   - **tenant** (`tenantScoped` route + `roles.universityId`): kendi üniversitesi.
   - **club** (ayrı katman, değişmiyor): member/officer/president.
3. **Roller = yetki demetleri.** Zengin varsayılan set gelir ama **DB asıl
   kaynak** — tenant kendi rollerini üretebilir.
4. **Kulüp-içi katman korunur;** üstüne tenant moderasyon yetkileri eklenir.

### B2. Önerilen yetki kataloğu (yeni olanlar ⭐)

**Platform (global):**
- `university.create`, `university.delete` — tenant onboard/offboard
- `role.manage`, `permission.manage` — global rol/katalog
- `platform.audit.view` ⭐ — salt-okunur platform geneli izleme

**Tenant — akademik yapı (tenantScoped):**
- `university.update`
- `university.domain.create/update/delete`
- `university.faculty.create/update/delete`
- `university.department.create/update/delete`
  *(okuma zaten public — view yetkisi gerekmez)*

**Tenant — kullanıcılar:**
- `user.view` ⭐ — listeleme + detay (salt-okunur)
- `user.manage` — durum (askı) + bölüm değiştirme
- `user.role.assign` ⭐ *(veya tenant-scoped `role.manage`)* — kullanıcıya rol atama

**Tenant — kulüp gözetimi:**
- `club.view` ⭐ — tüm kulüpleri (pending/archived dahil) + danışman listesini görme
- `application.view` ⭐ — başvuruları görme *(karar ayrı)*
- `club.approve` — başvuru onay/red
- `club.update` — durum + profil (yönetici)
- `club.advisor.manage` — danışman ata/kaldır
- `club.delete` — kalıcı silme
- `club.member.manage` ⭐ — herhangi bir kulüpte üye çıkar/rol düzelt (override)
- `announcement.moderate` ⭐ — herhangi bir kulübün duyurusunu kaldır
- `gallery.moderate` ⭐ — herhangi bir kulübün galeri görselini kaldır

**Tenant — rol yönetimi (opsiyonel self-service):**
- tenant-scoped `role.manage` → tenant kendi (`universityId = kendi`) rollerini yönetir

### B3. Önerilen roller (Türk üniversite yapısı)

**Platform katmanı:**

| Rol | Karşılığı | Yetkiler |
|---|---|---|
| `super_admin` | SaaS operatörü | Her şey (platform + tüm tenant) |
| `platform_support` ⭐ | Destek/izleme | Tüm `*.view` + `platform.audit.view` (yazma yok) |

**Tenant katmanı** (roller `universityId` = tenant, ya da global şablon):

| Rol | Karşılığı | Yetkiler |
|---|---|---|
| `university_admin` | Rektörlük / Genel Yönetim | Tenant'ın tamamı: user.*, club.*, university.* (akademik yapı), moderasyon, (scoped) role.manage |
| `student_affairs` ⭐ | SKS / Öğrenci Kulüpleri Koord. | application.view, club.view, club.approve, club.update, club.advisor.manage, club.member.manage, announcement.moderate, gallery.moderate |
| `academic_affairs` ⭐ | Öğrenci İşleri / BİDB | university.faculty.*, university.department.*, university.domain.*, user.view, user.manage (bölüm) |
| `content_moderator` ⭐ | İçerik denetçisi | announcement.moderate, gallery.moderate, club.view |
| `auditor` ⭐ | Denetim / İzleme (Dekan, Rektör Yrd.) | Tüm tenant `*.view` (yazma yok) |

**Akademik/personel & öğrenci:**

| Rol | Not |
|---|---|
| `advisor` | Yetenek etiketi olarak korunur (danışman atanabilme şartı). İsteğe bağlı: `me/advised-clubs` dışında yetki taşımaz. |
| `student` | Temel rol; kulüp güçleri kulüp katmanından gelir |

> **Faculty-scope (Dekan/Bölüm Başkanı seviyesi):** Gerçek bir fakülte/bölüm
> bazlı yetki (örn. "yalnızca Mühendislik Fakültesi kulüplerini onayla") için
> RBAC'a **fakülte kapsamı** eklenmesi gerekir (bugün yok). Bu, ayrı ve daha
> büyük bir adım — önce tenant seviyesini oturtup sonraya bırakmayı öneriyorum.

### B4. Örnek rol → yetki matrisi (öneri)

| Yetki | super_admin | platform_support | university_admin | student_affairs | academic_affairs | content_moderator | auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| university.create/delete | ✅ | — | — | — | — | — | — |
| role.manage / permission.manage | ✅ | — | (tenant) | — | — | — | — |
| university.update | ✅ | — | ✅ | — | — | — | — |
| university.faculty.* | ✅ | — | ✅ | — | ✅ | — | — |
| university.department.* | ✅ | — | ✅ | — | ✅ | — | — |
| university.domain.* | ✅ | — | ✅ | — | ✅ | — | — |
| user.view | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| user.manage | ✅ | — | ✅ | — | ✅ | — | — |
| user.role.assign | ✅ | — | ✅ | — | — | — | — |
| club.view / application.view | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| club.approve | ✅ | — | ✅ | ✅ | — | — | — |
| club.update | ✅ | — | ✅ | ✅ | — | — | — |
| club.advisor.manage | ✅ | — | ✅ | ✅ | — | — | — |
| club.member.manage | ✅ | — | ✅ | ✅ | — | — | — |
| club.delete | ✅ | — | ✅ | — | — | — | — |
| announcement.moderate / gallery.moderate | ✅ | — | ✅ | ✅ | — | ✅ | — |
| platform.audit.view | ✅ | ✅ | — | — | — | — | — |

---

## C. Uygulama planı (onaydan sonra)

1. **Katalog genişletme** (`*.permissions.ts` + seed): yeni `view`/`moderate`/
   `member.manage`/`audit.view` anahtarları. Yeni feature dosyaları:
   `announcements.permissions.ts`, `gallery.permissions.ts` (bugün yoklar).
2. **Guard düzeltmeleri** (A1): admin GET route'ları → `club.view`/`application.view`/
   `user.view`. Yazma route'ları olduğu gibi.
3. **Moderasyon route'ları** (A6): tenant yetkisiyle kulüp içeriğine üstten
   müdahale — ya yeni admin route'ları (`DELETE /admin/.../announcements/:id`),
   ya da mevcut kulüp route'larına "tenant perm VEYA kulüp rolü" köprüsü.
4. **Rol seti** (seed): yukarıdaki roller + matris. `admin` → `university_admin`
   olarak yeniden adlandırılır (geri uyumluluk için alias/koruma gerekir — kod
   `"admin"` sabitine bakıyor; dikkatli migration).
5. **Tenant-scoped rol yönetimi** (A5, opsiyonel): rol route'larına tenant scope.
6. **Dokümanlar** güncellenir (README rol matrisi, 02/03).

> **Dikkat — kırılganlık:** Kod bazı yerlerde rol ADINA sabit referans veriyor
> (`assignGlobalRole`'da `"admin"/"super_admin"`, `enforceTenantScope`'ta
> `"super_admin"`, `addAdvisor`'da `"advisor"`, seed). Rol adı değiştirmek/
> yeniden düzenlemek bu noktaların hepsini birlikte güncellemeyi gerektirir.
> Bu yüzden büyük yeniden adlandırma (admin→university_admin) **bilinçli bir
> migration adımı** olarak ele alınmalı.

---

## D. Karar noktaları

Bu tasarımın uygulanması birkaç ürün kararına bağlı — [bir sonraki adımda
netleştirilecek]:

1. **Rol seti ne kadar geniş?** (5 kurumsal rol mü, yoksa daha sade 2-3 mü?)
2. **Salt-okunur `*.view` yetkileri ve guard düzeltmeleri** eklensin mi? (A1)
3. **Tenant kendi rollerini yönetsin mi?** (A5 — tenant-scoped role.manage)
4. **`admin` → `university_admin` yeniden adlandırması** yapılsın mı, yoksa
   `admin` adı korunup yetkileri mi genişletilsin? (migration riski)
5. **Kulüp içeriği moderasyonu** (A6) bu turda mı, sonraya mı?
