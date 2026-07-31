# Şema, Ürün ve Doküman Yol Haritası

Bu dosya **veri modeli**, **SaaS ürünleşme** ve **dokümantasyon** eksenindeki
borcu sıraya koyar. Güvenlik/core ekseni ayrı bir dosyada:
[GUVENLIK_YOL_HARITASI.md](GUVENLIK_YOL_HARITASI.md).

Sıralama ilkesi aynı: önce **ucuz + bugün hata üreten** maddeler, sonra
**yapısal bütünlük**, sonra **ürünleşme**, en sonda **alan derinliği**.
Her madde `schema.ts` / `docs/` üzerinden doğrulanmıştır (Temmuz 2026).

---

## Tier 0 — Bugün hata üreten ✅ TAMAMLANDI (31 Tem 2026)

İki migration halinde uygulandı:
`20260731130102_tier0_sema_duzeltmeleri` ve `20260731130144_dogrulama_tokeni_hashlenir`
(ikinci ayrı duruyor çünkü aynı tabloda kolon düşürüp eklemek drizzle-kit'te
etkileşimli "yeniden adlandırma mı?" sorusu doğuruyor — CI'da takılırdı).

Doğrulandı: `typecheck` temiz, 105 test yeşil (4 yenisi e-posta harf
normalizasyonunu kilitliyor), migration'lar sıfırdan kurulan test DB'sinde
uygulanıyor, kısıtlar canlı DB'de tek tek denendi (büyük harfli e-posta/domain,
mükerrer rol adı reddedildi; `linkedin` platformu migration'sız kabul edildi;
düz token ile doğrulama çalışıyor, DB'de yalnızca özet duruyor).

### 0.1 E-posta normalize edilmiyor  ⭐ en somut bug ✅
**Durum:** Kapandı. `auth.schema.ts` → `emailField` (`.trim().toLowerCase().email()`),
`university.schema.ts` → `domainField`, DB'de `users_email_lowercase` ve
`university_domains_domain_lowercase` CHECK kısıtları.

Sorun: `users` üzerindeki tekillik index'i harfe duyarlıydı, dolayısıyla
`Ahmet@x.edu.tr` ile `ahmet@x.edu.tr` aynı kişi için **iki hesap** açıyordu ve
login yanlış satıra düşüyordu. Tenant çıkarımı da kaçıyordu: e-postadan ayrıştırılan
domain `universityDomains.domain` ile harfe duyarlı karşılaştırıldığı için büyük
harfle yazılan okul maili "domain kayıtlı değil" alıyordu.

`citext` yerine **CHECK kısıtı** seçildi: `lower()` üzerinde ifade-index'i ya da
`citext` uzantısı yerine "kolonda zaten küçük harf olsun" kuralı, tekilliği
mevcut index'lerle case-insensitive yapar ve normalizasyonu atlayan her yolu
(seed, script, yeni bir rota) sessizce geçmek yerine patlatır.

### 0.2 `timestamp` vs `timestamptz` karışıklığı ✅
**Durum:** Kapandı. Tüm zaman kolonları `timestamptz`.

`created_at`/`updated_at` tz'siz, `deleted_at` tz'liydi — aynı tabloda iki farklı
zaman tipi. Etkinlikler (3.1) geldiğinde bu doğrudan kayıp-saat hatası üretirdi.

> Migration'daki cast'ler oturumun TimeZone'una göre yorumlanır; varsayım
> (Postgres UTC ile çalışır) migration dosyasının başına yazıldı.

### 0.3 `roles` tablosunda tekillik kısıtı yok ✅
**Durum:** Kapandı. `role_name_per_university_idx` (tenant) +
`global_role_name_idx` (partial, `university_id IS NULL`).

İki index gerekiyor çünkü Postgres NULL'ları birbirinden farklı sayar — bileşik
index tek başına global şablon rolleri korumazdı (`users`'taki aynı tuzak).
Aynı tenant'ta iki `university_admin` olması effective-permission ve rütbe
çözümlemesini belirsizleştirirdi.

### 0.4 Hiçbir yabancı anahtarda `onDelete` yok ✅
**Durum:** Kapandı. Her FK'de açık politika var (varsayılan `no action` kalmadı).

| Politika | Nereye | Gerekçe |
|---|---|---|
| `cascade` | `clubMembers.*`, `clubAdvisors.*`, `clubContactLinks.clubId`, `clubGallery.clubId`, `announcements.clubId`, `emailVerifications.userId`, `pushSubscriptions.userId`, `notifications.userId`, `userRoles.*`, `userPermissions.*`, `rolePermissions.*`, `clubApplicationApprovals.applicationId`, `roles.universityId`, `universityDomains.universityId` | Sahiplik: üst kayıt gidince alt kayıt anlamsız |
| `restrict` | `clubs.universityId`, `clubs.createdBy`, `faculties.universityId`, `departments.facultyId`, `users.universityId`, `clubGallery.uploadedBy`, `announcements.authorId`/`universityId`, `clubApplications.*`, `auditLogs.*`, `userModerationActions.*` | Veri/kayıt kaybı — silme bilinçli olmalı |
| `set null` | `users.departmentId`, `clubApplicationApprovals.approverId` | Bağ düşer, kayıt yaşar |

Denetim izi (`auditLogs`) ve moderasyon geçmişi bilerek `restrict`: bunlar birer
**kayıttır**, başka bir satırın silinmesinin yan etkisiyle kaybolamaz. Kullanıcı
"silme" yolu bu yüzden anonimleştirmedir (1.2).

### 0.5 Eksik indexler ✅
**Durum:** Kapandı. Eklenenler: `announcements (club_id, created_at desc)`,
`club_gallery (club_id, created_at desc)`, `email_verifications (user_id)`,
`club_applications (university_id, status)`, `club_applications (applicant_id)`,
`clubs (created_by)`.

> `users.departmentId` **eklenmedi**: bölüme göre listeleme bugün bir sorgu yolu
> değil; tüketicisi doğduğunda eklenir. `users.universityId` ve
> `clubs.universityId` de ayrı index istemez — mevcut bileşik unique index'ler
> (`email_per_university_idx`, `slug_per_university_idx`) bu kolonla başladığı
> için önek olarak kullanılabiliyor.

### 0.6 `baseTimestamps` iki yerde tanımlı ✅
**Durum:** Kapandı. `db/schema.ts` artık `core/db/base.entity.ts`'teki
`timestamps`'i kullanıyor; kopya kaldırıldı.

Çatının sunduğu kolon seti projede kullanılmıyorsa dikiş ölü demektir — ve iki
taraf saparsa (0.2'de tam olarak bu oldu) kimse fark etmez.

### 0.7 Enum/varchar ilkesine aykırı tek yer: `contactPlatformEnum` ✅
**Durum:** Kapandı. `varchar(32)` + `CONTACT_PLATFORMS` katalogu
(`clubs.types.ts`), zod şeması katalogdan türetiliyor. `contact_platform` pgEnum
tipi düşürüldü; `linkedin`/`youtube`/`tiktok` katalogla birlikte eklendi.

### 0.8 `emailVerifications.token` düz metin ✅
**Durum:** Kapandı. Kolon `token_hash` (SHA-256, 64 hex); üretim/hash'leme
`core/auth/token.ts` → `generateOneTimeToken` / `hashToken`.

Düz token yalnızca maildeki linkte yaşar. bcrypt yerine SHA-256: token yüksek
entropili (128 bit) ve kısa ömürlü, yani yavaşlatmaya gerek yok ve doğrulama tek
indeksli eşitlik sorgusu olarak kalıyor. Aynı desen şifre sıfırlama token'ları
için de geçerli (2.4).

> Migration dolaşımdaki token'ları siler (özet geriye üretilemez) — kullanıcılar
> resend akışıyla yenisini alır. Ayrıntı: [MAIL_DOGRULAMA.md](MAIL_DOGRULAMA.md).

---

## Tier 1 — Yapısal bütünlük

### 1.1 Çapraz-tenant sızıntısı DB tarafından engellenmiyor  ⭐ ✅
**Durum:** Kapandı (31 Tem 2026) — migration `20260731132233_capraz_tenant_kilidi`.

`clubMembers`, `clubAdvisors`, `clubGallery` artık kendi `university_id`'sini
taşıyor ve **iki bileşik FK** ile hem kulübe hem kullanıcıya bağlanıyor; ikisi de
aynı kolonu kullandığı için Postgres şunu zorunlu kılıyor:

    kulübün üniversitesi == satırın üniversitesi == kullanıcının üniversitesi

`announcements` (denormalize `university_id` kulübünkinden sapabiliyordu) ve
`clubApplications` (başvuran başka tenant'tan olabiliyordu) da kilitlendi.
Hedef tekillik kısıtları: `clubs_id_university_unique`, `users_id_university_unique`.

**Kapsam kararları:**
- **Kullanıcı tarafı kilidi yalnızca üyelik tablolarında** (`clubMembers`,
  `clubAdvisors`, `clubApplications.applicantId`). `clubGallery.uploadedBy` ve
  `announcements.authorId` bilinçli olarak serbest: oraya da kilit koymak
  platform hesaplarının içerik girmesini KALICI olarak yasaklardı — bu bir ürün
  kararı, sessizce şemaya gömülmemeli.
- `clubContactLinks` kapsam dışı: tek ebeveyni var, eşleşmeyecek ikinci taraf yok.
- `clubApplicationApprovals.approverId` kapsam dışı: bir `super_admin`'in onay
  adımına düşmesi meşru bir senaryo.
- **Yan etki (kasıtlı):** platform hesapları (`university_id IS NULL`) hiçbir
  kulübe üye/danışman olamaz — MATCH SIMPLE gereği eşleşme yok.

**Tuzak — tsc bellek taşması:** drizzle'ın `foreignKey()` jeneriği `foreignColumns`'u
eşlenmiş bir tip üzerinden çıkarıyor ve bu şemadaki bileşik FK'lerle birlikte
`tsc`'yi "Zone Allocation failed - process out of memory" ile öldürüyor. Çözüm:
`schema.ts` içindeki `compositeForeignKey` sarmalayıcısı çıkarımı düz
`PgColumn[]`'a indiriyor. Yeni bileşik FK eklerken **onu** kullanın.

Doğrulama: `tests/tenant-integrity.test.ts` — 8 test, her biri HANGİ kısıtın
tetiklendiğini de doğruluyor. Bu testler bilinçli olarak HTTP'den değil doğrudan
`db`'den yazar: sorulan soru "rota 403 veriyor mu" değil, "uygulama katmanı
atlanırsa veritabanı durduruyor mu".

<details>
<summary>Kapanmadan önceki durum (kayıt için)</summary>

`clubMembers` yalnızca `(club_id, user_id)` tutuyor. A üniversitesindeki bir
kullanıcıyı B üniversitesinin kulübüne yazan bir servis hatası **veritabanı
seviyesinde tamamen geçerli** bir satırdır. `announcements.universityId`
denormalize ama kulübün üniversitesiyle eşleştiği garanti değil — sessizce sapabilir.

Bugünkü tek savunma uygulama katmanı. Çok kiracılı bir üründe bu, denetimde ilk
sorulan şeydir ve "servis dikkat ediyor" kabul edilebilir bir cevap değildir.

**Yapılacak (kademeli):**
1. `clubs`'a `UNIQUE (id, university_id)` ekle.
2. Alt tablolara `university_id` kolonu + **bileşik FK**:
   `FOREIGN KEY (club_id, university_id) REFERENCES clubs(id, university_id)`.
   Böylece tenant karışması yazılabilir olmaktan çıkar.
3. İleri adım: Postgres **RLS** (derinlemesine savunma) — `app.current_tenant`
   session değişkeni + policy. Kararı 2.1'den sonra vermek daha doğru.

</details>

> **Devam maddesi:** Yukarıdaki 3. adım (Postgres **RLS**) yapılmadı ve bilinçli
> olarak bekliyor. Bileşik FK "yanlış tenant'a YAZILAMAZ"ı garanti eder; RLS ise
> "yanlış tenant OKUNAMAZ"ı ekler. İkincisinin doğru zamanı, tenant yapılandırması
> (2.1) oturduktan sonra — oturum değişkenini nereden besleyeceğimiz oraya bağlı.

### 1.2 Kullanıcı silme / KVKK ✅
**Durum:** Kapandı (31 Tem 2026) — migration `20260731133623_kullanici_anonimlestirme`.

KVKK silme talebi **anonimleştirme** olarak uygulandı:
`POST /api/moderation/universities/:universityId/users/:userId/anonymize`
(`user.manage`, tenant-scoped).

Gerçek silme neden değil: kullanıcı satırı `auditLogs`, `announcements`,
`clubGallery` ve moderasyon geçmişi tarafından **aktör** olarak referanslanıyor ve
o FK'ler bilinçli olarak `restrict` (Tier 0.4). Denetim izi, ilgilisinin talebiyle
yok edilemez. Dolayısıyla kimliği tanımlayan alanlar maskeleniyor, kayıtların
bütünlüğü kalıyor.

| Alan | Sonuç |
|---|---|
| `email` | `silinmis-<userId>@anonim.invalid` — `.invalid` RFC 2606 gereği asla gerçek bir alan adı olamaz; küçük harfli ve tekil olduğu için Tier 0.1'deki CHECK ve index korunur |
| `firstName` / `lastName` | `Silinmiş` / `Kullanıcı` |
| `studentNumber`, `photoUrl`, `departmentId` | `NULL` |
| `passwordHash` | rastgele — `deletedAt` kontrolünü biri atlasa bile girilebilecek parola kalmasın |
| `deletedAt` | `now()` — silinmişlik işareti |

**Kararlar:**
- `userStatusEnum`'a `deleted` **eklenmedi**: Postgres'te `ALTER TYPE ... ADD VALUE`
  transaction içinde çalışmaz, drizzle migration'ları ise transaction içinde koşar.
  İşaret `deleted_at IS NOT NULL`.
- Hesabı ölü kılan tek nokta `shared/rbac/rbac.repository.ts`: `deletedAt` doluysa
  boş yetki seti + `status: "suspended"` döner. Bu, `attachAuthz` ve
  `requireActiveUser`'ın **ortak** kaynağı olduğu için her rotaya ayrı kontrol
  eklemekten güvenli; rolleri de boşaltmak ikinci savunma.
- Endpoint ayrı bir yetki anahtarı almadı (`user.manage` yeterli): asıl koruma
  gövdedeki `confirm: "ANONIMLESTIR"` + zorunlu 10+ karakterlik gerekçe.
  Gerekçe moderasyon geçmişine yazılır — geri alınamaz bir işlemin tek dayanağı.

Doğrulama: `tests/anonymize.test.ts` (9 test) — maskeleme, geçmişe düşme,
giriş reddi, **elindeki token'ın anında geçersizleşmesi** (cache invalidation),
mükerrer anonimleştirme reddi, self-koruma, tenant scope.

> **Kalan:** saklama süresi politikası ve kişisel veri envanteri (4.5 →
> `docs/KVKK.md`). Akış artık var, politika yazılabilir.

### 1.3 `clubMembers` tarihçe tutmuyor ✅ (kısmi)
**Durum:** Kapandı (31 Tem 2026) — migration `20260731135718_uyelik_tarihcesi_ve_ret_gerekcesi`.

`leftAt` + `timestamps` eklendi. Ayrılma artık satırı **silmiyor**, damgalıyor;
tüm okuma yolları `leftAt IS NULL` filtresi uyguluyor, yeniden katılım satırı
diriltiyor (`onConflictDoUpdate`).

**`academicTerm` bilinçli olarak EKLENMEDİ.** Ham bir `varchar` dönem alanı bugün
eklenirse, 3.3'te gerçek `academic_terms` tablosu geldiğinde ikinci kez migrate
etmek gerekir — projenin kendi ilkesine (erken soyutlama = yanlış soyutlama) aykırı.

> **Bilinen sınır:** PK hâlâ `(club_id, user_id)` olduğu için bir kişinin aynı
> kulüpten birden fazla giriş-çıkışı tutulamaz; yalnızca **son** ayrılış saklanır.
> Tam tarihçe, PK'nın vekil `id`ye çevrilip `(club_id, user_id) WHERE left_at IS NULL`
> kısmi tekillik index'ine geçmesini gerektirir — asıl değerini dönem kavramıyla
> kazanacağı için **3.3 ile birlikte** yapılmalı.

Doğrulama: `tests/membership-history.test.ts`.

### 1.4 `clubApplicationApprovals`'ta gerekçe alanı yok ✅
**Durum:** Kapandı (31 Tem 2026) — aynı migration.

`note: text()` eklendi. Reddederken **zorunlu** (min 10 karakter), onayda
opsiyonel. Zorunluluk iki katmanda: zod şeması (`rejectApplicationSchema`) ve
servis katmanı — repository'den doğrudan çağıran bir yol açılırsa kural yine tutar.

Doğrulama: `tests/membership-history.test.ts`.

---

## Tier 2 — SaaS ürün katmanı (bugün şemada hiç yok)

`universities` tablosu bugün yalnızca `id, name, slug` taşıyor — oysa satılan
birim bu. Sistem şu an "çok kiracılı bir uygulama"; "SaaS ürünü" olması için
aşağıdakiler gerekiyor.

### 2.1 Tenant yaşam döngüsü ve yapılandırma  ⭐
**Yapılacak:**
- `universities`'e: `status` (`trial` / `active` / `past_due` / `suspended`),
  `timezone`, `defaultLocale`, `contactEmail`, `logoUrl`, `primaryColor`.
  Bugün bir üniversiteyi tümden dondurmanın yolu yok — kullanıcıları tek tek
  askıya almak gerekiyor.
- `tenant_settings` (tenant başına `jsonb` veya key/value): kulüp kurma kaç adımlı,
  öğrenci kendi kulübünü kurabilir mi, galeri/duyuru limitleri, hangi feature açık.
  **Bugün bu kurallar koda gömülü, yani her üniversite aynı kurallarla çalışmak
  zorunda — SaaS'ın en sık çarptığı duvar budur.**
- `attachAuthz`'a tenant `status` kontrolü (askıya alınmış tenant → 403), tıpkı
  kullanıcı `status`'ünde olduğu gibi; authz cache'i zaten var.

### 2.2 Plan / abonelik / kota
**Yapılacak:** `plans`, `subscriptions`, kullanım sayaçları. Feature flag ve limit
(kulüp sayısı, depolama, aylık bildirim) olmadan fiyatlandırma yapılamaz.
2.1'in üstüne oturur; ondan önce yazılmasın.

### 2.3 Tenant onboarding ✅ (kısmi)
**Durum:** Runbook yazıldı — [ONBOARDING_TENANT.md](ONBOARDING_TENANT.md).
Prosedür artık uçtan uca, gerçek endpoint'lerle kayıtlı.

**Kalan:** tek çağrıda tenant açan bir onboarding endpoint'i/scripti (üniversite
+ domainler + ilk `university_admin` + davet maili). Bugün adımlar tek tek
yapılıyor; otomasyonun doğru zamanı 2.1 (tenant ayarları) oturduktan sonra —
yeni tenant'ın hangi varsayılanlarla açılacağı oraya bağlı.

### 2.4 Self-servis şifre sıfırlama
**Durum:** Açık. Bugün yalnızca yöneticinin sıfırlaması var
(`mustChangePassword` + `/api/moderation/.../reset-password`).

"Şifremi unuttum" olmadan ürün satılamaz. Şema tarafı: `password_resets`
(token **hash'i**, `expiresAt`, `usedAt`) — `emailVerifications` ile aynı desen
(bkz. 0.8). Token iptali ekseni için bkz.
[GUVENLIK_YOL_HARITASI Tier 1.3](GUVENLIK_YOL_HARITASI.md).

---

## Tier 3 — Alan derinliği (ürünün asıl işi)

### 3.1 Etkinlikler (events) — en büyük alan eksiği  ⭐
**Durum:** Yok.

Bir kulüp yönetim sisteminin kalbi duyuru değil **etkinliktir**. Bugün
`announcements` + `gallery` var; etkinlik yok. Bu haliyle sistem "kulüp vitrini"
seviyesinde kalıyor.

**Yapılacak:**
- `events` — `clubId`, `universityId`, başlık, açıklama, konum, `startsAt`/`endsAt`
  (**timestamptz**, bkz. 0.2), kapasite, kayıt açık mı, görsel, `status`.
- `event_registrations` — kullanıcı × etkinlik, durum (kayıtlı / yedek / iptal).
- `event_attendance` — yoklama (QR ile). Kulüplerin danışman hocaya ve okula
  verdiği faaliyet raporunun kaynağı budur; sistemin kuruma "değer" anlattığı yer.

### 3.2 Duyuru yaşam döngüsü
**Durum:** Açık. `announcements` yalnızca başlık + içerik tutuyor.

**Yapılacak:** `status` (`draft` / `published`), `publishedAt` (zamanlanmış
duyuru), `pinned`, `visibility` (`public` / `members_only`). Bugün taslak
kaydetmek ve üyeye özel duyuru yapmak mümkün değil.

### 3.3 Dönem (akademik term) kavramı
**Durum:** Yok.

Kulüp yönetimi dönemseldir: başkan her yıl değişir, üyelik her dönem yenilenir.
`academic_terms` tablosu + `clubMembers.termId` (1.3 ile birlikte) — yoksa
"geçen yılın yönetimi" diye bir kavram yok.

### 3.4 Medya varlıkları
**Durum:** Açık. `logoUrl` / `coverUrl` / `imageUrl` düz `varchar`.

Kurumsal bir üründe dosya bir varlıktır: `media_assets` (sahip, boyut, MIME,
storage key, yükleyen, tarama durumu) + tenant başına depolama kotası (2.2).
Bugün yüklenen dosyanın kime ait olduğu, ne kadar yer kapladığı, silinince
temizlenip temizlenmediği izlenemiyor.

### 3.5 Sonraki halka (sıra bekler)
Kulüp belgeleri (tüzük, faaliyet raporu), bütçe/talep akışı, okul geneli duyuru
(`announcements.clubId` nullable), kulüp içi form/anket.

---

## Tier 4 — Doküman borcu ✅ (4.4 hariç)

Doküman setinin **içeriği** iyi; sorun **bakım modeli**ydi. Aşağıdakiler
doğrulanmış sapmalardı ve 31 Tem 2026'da kapatıldı — biri hariç.

> **Kalıcı çözüm:** `bun run docs:check` (`scripts/check-docs.ts`) artık CI'da
> koşuyor: kırık relative link ve API.md ↔ kod mount uyumsuzluğu ilk günde
> yakalanıyor. 4.1/4.3'teki sapmaların aylarca fark edilmemesinin sebebi bu
> kontrolün olmamasıydı.

### 4.1 `design/` klasöründeki eskimiş içerik  ⭐ ✅
**Durum:** Kapandı (31 Tem 2026). Eskiyen bölümler `docs/design/archive/`'a taşındı, README §2/§3/§5/§7 güncel modele göre yeniden yazıldı, banner'lar kaldırıldı.

<details>
<summary>Kapanmadan önceki tespit (kayıt için)</summary>
`design/README.md` üst üste iki uyarı banner'ı taşıyor ("GÜNCEL MODEL" → "DAHA DA
GÜNCEL") ve §2/§3'te hâlâ eski 4 rollük matris duruyor. Doğrulanan çelişkiler:

| Doküman | Gerçek |
|---|---|
| §7: `PATCH .../users/:userId/status` ✅ | Kaldırıldı → `admin.routes.ts:79`; yerine `/api/moderation` |
| §7: "askıya alma → anlık kesme ❌ eksik" | `attachAuthz` status'ü authz cache'inden okuyup 403 veriyor (05 #7 "Öneri A" uygulandı). GUVENLIK_YOL_HARITASI 1.3 doğru anlatıyor → aynı gerçek üç dosyada üç halde |
| §5: "her kullanıcı bir universityId'ye bağlıdır" | `nullable` (07 geçersiz kıldı); banner var, metin düzeltilmemiş |
| §3: 4 rollük seed matrisi | 9 rollük model |

**Yapılacak:** Eskiyen bölümleri banner'la işaretlemeyi bırak; `design/archive/`'a
taşı veya sil. §2/§3/§5/§7'yi 06 ve 07'ye göre yeniden yaz. **Kural: üçüncü
banner eklenecekse dosya yeniden yazılmalıdır.**

</details>

### 4.2 Kırık çapraz referans ✅
**Durum:** Kapandı (31 Tem 2026). Var olmayan dokümana atıf düzeltildi; `docs:check` artık tüm relative linkleri tarıyor (178 link, kırık yok).

<details>
<summary>Kapanmadan önceki tespit (kayıt için)</summary>
`GUVENLIK_YOL_HARITASI.md:145` → "Outbox — bkz. **observability yol haritası**,
Tier 3". Repo'da böyle bir dosya yok (LOGLAMA.md'de Tier/outbox geçmiyor).

**Yapılacak:** Ya o dosyayı oluştur, ya referansı bu dosyaya/LOGLAMA.md'ye çevir.

</details>

### 4.3 `API.md` eksik kapsam ✅
**Durum:** Kapandı (31 Tem 2026). `/api/notifications` ve `/api/audit` bölümleri eklendi; kapsam kontrolü CI'da.

<details>
<summary>Kapanmadan önceki tespit (kayıt için)</summary>
"Endpoint Referansı" §1–8'de `/api/notifications` ve `/api/audit` **yok** — giriş
cümlesindeki mount listesinde geçiyorlar ama bölümleri yok. Ayrı dosyalarda
(BILDIRIMLER.md, DENETIM_VE_HATA.md) anlatılıyorlar; tek referansa bakan
geliştirici bulamıyor.

**Yapılacak:** İki bölüm ekle ya da API.md'de o iki yüzey için açık yönlendirme yaz.

</details>

### 4.4 Elle yazılan API dokümantasyonu sürdürülemez  ⭐ kökteki sorun
`API.md` (443 satır) + `frontend/` (9 dosya, ~2900 satır) elle sürdürülüyor. Bir
endpoint değişince güncellenecek yer sayısı çift haneli — 4.1/4.3'teki sapmaların
sebebi disiplin değil, **modelin kendisi**.

**Yapılacak:** `@hono/zod-openapi` ile OpenAPI üretimi (zod şemaları zaten var) +
Swagger UI. Bu madde bugün [GUVENLIK_YOL_HARITASI Tier 3](GUVENLIK_YOL_HARITASI.md)'ün
en altında; doküman borcunun kökü olduğu için **yukarı çekilmeli**.

Yanına ucuz CI kontrolleri: `docs/` içindeki relative link kontrolü + "mount
edilen router sayısı ile API.md bölüm sayısı uyuşuyor mu" testi. Bugün CI
(`typecheck` + `test`) dokümanlara hiç bakmıyor.

### 4.5 Eksik doküman türleri ✅
**Durum:** Kapandı (31 Tem 2026). `docs/adr/` (7 ADR), `ONBOARDING_TENANT.md`, `DATA_MODEL.md`, `KVKK.md`, `CHANGELOG.md` yazıldı.

<details>
<summary>Kapanmadan önceki tespit (kayıt için)</summary>
| Doküman | Neden gerekli |
|---|---|
| `docs/DATA_MODEL.md` | 20+ tablonun ER diyagramı (mermaid) + alan sözlüğü + "bu tabloda tenant kolonu var mı" sütunu. Bugün şema yalnızca kod yorumlarında anlatılıyor; bu yüzden Tier 0-3'teki eksikler görünmez kalmış. |
| `docs/adr/NNNN-*.md` | ADR kaydı yok. `design/` fiilen RBAC için ADR gibi çalışıyor — formatı genelleştir (neden Bun/Drizzle/Hono, hangi alternatif elendi, ne zaman gözden geçirilecek). |
| `docs/KVKK.md` | Saklama süreleri, silme talebi akışı, hangi tablo kişisel veri taşıyor, işleme envanteri. operations.md "anonimleştir" diyor ama politika yazılı değil. Kurumsal alıcı sözleşme aşamasında ister. |
| `docs/ONBOARDING_TENANT.md` | Yeni üniversite açma runbook'u (bkz. 2.3). |
| `CHANGELOG.md` | Release cut ediliyor ama değişiklik günlüğü yok. `docs/README.md`'deki "Frontend'e son değişiklikler" bölümü aslında budur ve indeks dosyasında yaşamamalı. |

</details>

### 4.6 Dil politikası tanımsız ✅
**Durum:** Kapandı (31 Tem 2026). `CONTRIBUTING.md`'ye kural olarak yazıldı.

<details>
<summary>Kapanmadan önceki tespit (kayıt için)</summary>
README / architecture / operations **İngilizce**; API / design / frontend
**Türkçe**; CLAUDE.md İngilizce. `docs/README.md` bunu bir dipnotla geçiyor.

İkili yapı savunulabilir (teknik docs EN, ürün/entegrasyon docs TR) ama **kural
olarak yazılmalı** — yoksa her yeni dosyada tek tek karar veriliyor.
**Yapılacak:** `CONTRIBUTING.md`'ye tek cümlelik dil kuralı.

---

</details>

## Önerilen sıra

1. ~~**Tier 0**~~ ✅ tamamlandı (31 Tem 2026).
2. ~~**1.1 + 1.2 + 1.3 + 1.4**~~ ✅ tamamlandı — **Tier 1 kapandı**.
3. **4.1 / 4.2 / 4.3** — bir öğleden sonra; yanlış doküman, doküman olmamasından kötüdür.
4. **2.1 (tenant yaşam döngüsü + ayarlar)** → **2.4 (şifre sıfırlama)** → **2.2 (plan/kota)**.
5. **3.1 (events)** → **1.3 + 3.3 (dönemsel üyelik)** → **3.2 (duyuru yaşam döngüsü)**.
6. **4.4 (OpenAPI)** — 3.1 öncesinde yapılırsa yeni yüzeyin dokümanı kendiliğinden gelir.

> **Dengeye dair not:** Teknik altyapı (RBAC, audit, `core/` ayrımı,
> gözlemlenebilirlik, deploy zinciri) ürün olgunluğunun **önünde**. Çatı kurumsal,
> ama içinde henüz kulübün asıl işi (etkinlik) ve SaaS'ın asıl işi (tenant
> yapılandırması/abonelik) yok. Sıradaki yatırım `core/`'u daha da cilalamak
> değil, bu iki eksen olmalı.
