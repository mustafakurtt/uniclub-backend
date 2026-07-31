# 08 — Aday Soru Platformu (Tanıtım Günleri)

> **Durum: TASARIM / uygulanmadı.** Bu doküman bir karar kaydıdır — kod yazılmadan
> önce hangi kararların neden verildiğini sabitler. Kod tabanına karşı doğrulanmıştır
> (`schema.ts`, `auth.service.ts`, `core/rbac/*`, `middlewares/rate-limit.middleware.ts`
> — Temmuz 2026). Önceki adım: [07 — Rütbe ve Kapsam](07-rutbe-ve-kapsam.md).

## 1. Neden?

YKS sonuçlarından sonra adaylar bölüm araştırır ve kafaları karışıktır. Üniversiteler
bunun için **tanıtım günleri** düzenler ve bu günlerde **öğrencileri görevlendirir**.
Süreç zaten vardır; sadece fiziksel bir stantla ve o birkaç günle sınırlıdır.

Bu feature o süreci çevrimiçine taşır: aday soruyu yazar, hedef üniversitenin
görevli öğrencisi cevaplar, soru-cevap **herkese açık** yayınlanır.

### Ayırt edici değer: doğrulanmış öğrenci kimliği

Soru-cevap yazmak kolaydır; zor olan **"bu cevabı veren gerçekten o bölümün
öğrencisi mi?"** sorusuna güvenilir cevap vermektir. Bu olmadan ürün, forumların
zayıf bir kopyasıdır.

Sistem bunu zaten çözmüş durumda: `university_domains` + e-posta domain doğrulaması
+ `pending → active` akışı tam olarak bu kanıtı üretir. Yani bu feature sıfırdan bir
ürün değil, **var olan kimlik altyapısının doğal büyüme yüzeyidir.**

### Arz sorunu neden yok

Bu tür platformlar genelde teknolojiden değil **cevap verecek kimsenin olmamasından**
ölür. Burada cevaplayanlar üniversite tarafından **zaten görevlendirilmiş** kişilerdir
ve zaten sistemde kayıtlıdır. Motivasyon icat edilmiyor, var olan bir görev dijitalleşiyor.

---

## 2. Sistemin kırdığı varsayım

Bugüne kadar **her kullanıcı bir üniversiteye aitti**. Aday hiçbirine ait değildir.
Kodda üç yere çarpar:

| Yer | Durum | Etki |
|---|---|---|
| `users.passwordHash` **notNull** | Google ile gelen adayın şifresi yok | Şema değişikliği ya da ayrı kimlik tablosu şart |
| Kayıt akışı domain zorunlu kılar | `auth.service.register` → `emailDomainNotRegistered` | Aday bu akıştan geçemez, ayrı bir kayıt yolu gerekir |
| `departments → faculties → universities` | Bölümler tenant'a bağlı | "Tüm üniversitelerde Bilgisayar Müh." ekseni **yok** (bkz. §9) |

**İyi haber — iki şey lehimize zaten hazır:**

- `users.universityId` **nullable** ([07](07-rutbe-ve-kapsam.md) ile geldi).
- `enforceTenantScope`, tenant'ı `null` olan ve bypass rolü de olmayan hesabı
  **zaten reddediyor**. Yani aday hesabı eklemek, kulüp/etkinlik/admin rotalarında
  kazara bir açık yaratmaz — varsayılan davranış güvenlidir.

---

## 3. Kimlik modeli (en kritik karar)

### Karar: adaylar `users` tablosunda, `universityId = NULL`

Ayrı bir `candidates` tablosu **kullanılmayacak**. Gerekçe:

1. **Dönüşüm hikâyesi.** Aday bir yıl sonra o okulu kazanıp `@ogr.xyz.edu.tr`
   maili edinebilir. Aynı satır kaldığında "bu kişi kayıt olmadan önce şunları
   sordu" bağı korunur — üniversite için gerçek bir geri bildirim değeri. İki ayrı
   tabloda bu bağ ya kurulamaz ya da kırılgan bir eşleştirmeye dayanır.
2. Auth, RBAC, audit, bildirim, hız sınırı, i18n — hepsi olduğu gibi çalışır.
3. Aday zaten hiçbir tenant kaynağına erişemez (§2).

**Bedeli:** `users` tablosu artık iki farklı kullanıcı sınıfı taşır. "Üniversitenin
kullanıcıları" sorguları zaten `universityId` ile filtrelendiği için etkilenmez;
ama **platform geneli sayımlar** (toplam kullanıcı) artık adayları da içerir.
Rapor/dashboard yazarken rol ya da `universityId IS NULL` ile ayrıştırılmalı.

### Karar: `user_identities` tablosu (v1'de kurulur)

```
user_identities
  id, userId → users.id
  provider      'password' | 'google' | 'school_email'
  providerKey   google sub / e-posta adresi
  verifiedAt
  createdAt
  UNIQUE(provider, providerKey)
```

Neden şimdi, feature v1'de kullanılmayacak olsa bile:

- Google ile gelen adayın **şifresi yok**; `passwordHash` notNull kısıtı ya
  gevşetilmeli ya kimlik ayrı tabloya taşınmalı. İkincisi doğru olanıdır.
- Dönüşüm (aday → öğrenci) **ikinci bir kimlik eklemek** demektir. Tablo yoksa
  bu ancak `users.email` kolonunu değiştirerek yapılabilir; o da kimlik ile
  iletişim adresini birbirine karıştırır ve geriye dönük veri göçü doğurur.

> ⚠️ **Bilinçli sınır:** v1'de mevcut şifreli giriş akışı **değiştirilmez**.
> `user_identities` doldurulur (mevcut kullanıcılar için `password` satırı,
> adaylar için `google` satırı) ama `auth.service.login` hâlâ `users.passwordHash`
> okur. Amaç, göç maliyetini şimdiden ödemek; refactor'ü v2'ye bırakmak.
> `users.email` bu aşamada **birincil iletişim adresi** olarak kalır.

### Mevcut index'lerle etkileşim

`platform_user_email_idx` — `email` üzerinde **kısmi unique**, `universityId IS NULL`
koşuluyla. Adaylar da bu index'i `super_admin`/`platform_support` ile paylaşır.
E-postalar zaten globalde benzersiz olduğu için sorun yoktur; ama şu anlama gelir:
**bir aday e-postası bir platform hesabıyla çakışamaz.** İstenen davranış budur.

---

## 4. Roller ve yetkiler

Rütbe sistemi [07](07-rutbe-ve-kapsam.md)'den gelir (yüksek = daha yetkili).

| Rol | rank | Kapsam | Nasıl atanır |
|---|--:|---|---|
| `candidate` | **5** | tenant'sız | Aday kaydında **otomatik** |
| `admission_rep` | **20** | tenant | `university_admin` atar (görevlendirme) |

`candidate` bilinçli olarak `student`ın (10) **altındadır**: hiçbir tenant kaynağına
erişmemeli ve hiçbir rolü yönetememelidir.

| Yetki | `candidate` | `admission_rep` | `university_admin` | `content_moderator` |
|---|:---:|:---:|:---:|:---:|
| `admission.ask` | ✅ | — | — | — |
| `admission.answer` | — | ✅ | — | — |
| `admission.moderate` | — | ✅ | ✅ | ✅ |
| `admission.rep.manage` | — | — | ✅ | — |

> Kurallar rol adına değil **yetki anahtarına** bakar (mevcut konvansiyon).
> `admission_rep` yalnızca **kendi üniversitesinin** kuyruğunu görür —
> `guard(..., { tenantScoped: true })` bunu zaten sağlar.

---

## 5. Veri modeli

```
admission_questions
  id
  universityId  → universities.id     NOT NULL   (hedef tenant)
  departmentId  → departments.id      NULL       (bölüm belirtilmemiş olabilir)
  askerId       → users.id            NOT NULL   (universityId'si NULL olan aday)
  body, slug
  status        pending | published | rejected
  publishedAt, createdAt

admission_answers
  id
  questionId    → admission_questions.id
  authorId      → users.id            (görevli öğrenci)
  body
  status        published | hidden
  createdAt, updatedAt
```

### Karar: bir sorunun **tek** hedef üniversitesi vardır

Aday aynı soruyu üç üniversiteye sormak isterse **üç ayrı kayıt** oluşur
(arayüz "aynı soruyu başka okula da sor" kolaylığı sunabilir; bu bir frontend
işidir). Çok hedefli (M:N) bir model reddedildi çünkü:

- "Cevaplamak = yayınlamak" modelini bozar — soruyu hangi üniversitenin görevlisi
  yayına alır?
- Public URL/SEO birimini bulanıklaştırır: tek soru, üç sayfa mı?
- Kuyruk sahipliği belirsizleşir.

### Karar: `universityId` sorunun üzerinde denormalize tutulur

`departmentId` üzerinden türetilebilirdi ama bölüm opsiyoneldir ve tenant kapsamı
sorgusu her okumada bir JOIN isterdi. Mevcut `auditLogs.universityId` deseniyle tutarlı.

---

## 6. Moderasyon politikası

### Karar: cevaplamak = yayınlamak

Soru `pending` gelir ve **yalnızca bir görevli cevapladığında** yayınlanır. Spam
için `rejected`. Ayrı bir moderasyon paneli yazılmaz.

Sonuç: hiçbir içerik bir insan karar vermeden herkese açık olmaz — auth'suz bir
yazma ucu açtığımız için bu şart (bkz. §8).

### Karar: üniversite **bayrak kaldırır, sessizce silemez**

Public bir akışta öğrenciler kendi üniversiteleri hakkında olumsuz şeyler
yazabilir; üniversite ise ödeyen/ev sahibi taraftır. "Sildir" baskısı gelecektir.

- Yayınlanmış bir cevap `hidden` yapılabilir, ama **her işlem denetim izine düşer**
  (`audit.sink` zaten `guard()` zincirinden otomatik kaydediyor).
- Silme (hard delete) **yoktur** — denetim izinin bütünlüğü, düzenlenebilirliğinden
  değerlidir (`auditRoutes` ile aynı ilke).

Bu politika koda değil ürüne aittir; buraya yazılmasının sebebi sonradan
tartışılmasın diye sabitlemektir.

---

## 7. Public yüzey (SEO)

Bugüne kadar **her şey auth arkasındaydı.** Bu feature ilk kez auth'suz uçlar açar.

- Yayınlanmış soru-cevaplar için **auth'suz GET** + slug tabanlı kalıcı URL.
- Cache: read-through (`core/cache`) — public trafik ani ve okuma ağırlıklıdır.
- Hız sınırı: IP başına, kısa pencere ([fa98719](../../) ile gelen kampüs-NAT
  ayarıyla tutarlı).

**İfşa edilir:** soru metni, cevap metni, üniversite/bölüm adı, cevaplayanın
görünen adı + bölüm/sınıf (§10'daki karara bağlı).

**ASLA ifşa edilmez:** e-posta, IP, `userId`, aday kimliği (§10), `pending`/`rejected`
sorular.

---

## 8. Hız sınırı

Adaylar artık **kimlikli** olduğu için soru sorma limiti IP'ye değil **`userId`'ye**
anahtarlanır. Bu, kampüs NAT sorununu bu uçta tamamen ortadan kaldırır (aynı okuldan
bağlanan yüz aday birbirinin sayacını yemez).

| Uç | Anahtar | Not |
|---|---|---|
| Aday kaydı | IP | Henüz kimlik yok — mevcut `registerLimit` deseni |
| Soru sorma | `userId` | Kimlik var, kesin anahtar |
| Public okuma | IP | Kaba sel koruması |

---

## 9. Bilinçli olarak kapsam dışı

Oy/beğeni, yorum zinciri, dosya eki, arama, özel mesaj.

**Üniversiteler-üstü program taksonomisi.** Adayın asıl sorusu "Bilgisayar
Mühendisliği nasıl bir bölüm?" — üniversiteden bağımsız. Mevcut şema bunu
cevaplayamaz (bölümler tenant'a bağlı). Ama SEO değerinin büyük kısmı
"X Üniversitesi Bilgisayar Mühendisliği nasıl" gibi **uzun kuyruk** aramalardan
gelir ve o tenant kapsamlıdır.

> **Ucuz hedge:** `departments` tablosuna nullable bir `canonicalProgramSlug`
> kolonu şimdiden eklenebilir. Kolon eklemek ucuzdur; asıl pahalı iş
> **eşleme verisini** sonradan üretmektir. Karar ertelenebilir ama bilinçli olsun.

---

## 10. Açık kararlar (ürün tarafı)

Bunlar kod yazmadan önce netleşmeli:

1. **Aday görünürlüğü.** Sorunun altında adayın adı görünsün mü? Öneri: **hayır** —
   "Aday" ya da opsiyonel takma ad. 18 yaşında biri "bu bölümde iş bulunur mu"
   sorusunu kalıcı olarak adına bağlamak istemez.
2. **Cevaplayan görünürlüğü.** Öneri: **doğrulanmış ama kısmen maskeli** —
   "Ayşe Y. · Bilgisayar Müh. 3. sınıf". Tam anonimlik güveni düşürür, tam açıklık
   görevliyi caydırır.
3. **Görevli ataması.** v1'de `university_admin` paneli mi, yoksa elle seed/SQL mi?
   (Elle daha hızlı; panel v2.)
4. **Ayrı marka/alan adı mı?** Uniclub kayıtlı öğrenciye kulüp yönetimi sunuyor;
   bu, kayıt olmamış adaya danışmanlık. Aynı kod tabanı aynı ürün demek değildir.

---

## 11. Fazlar

| Faz | İçerik | Neden bu sırada |
|---|---|---|
| **0** | `user_identities` tablosu + `candidate`/`admission_rep` rolleri + yetki kataloğu | Şema temeli — sonradan düzeltmesi pahalı olan tek kısım |
| **1** | Google SSO ile aday kaydı, soru sorma, görevli kuyruğu, cevaplama (= yayınlama) | Ürünün çekirdek döngüsü |
| **2** | Public okuma uçları, slug, cache, sitemap | SEO ve "aynı soruyu soracak diğer aday" değeri |
| **3** | Görevli atama paneli, bildirim (soru cevaplandı), gizleme + denetim | Operasyonel olgunluk |
| **4** | Aday → öğrenci dönüşümü (okul maili doğrulama, kimlik ekleme) | Asıl uzun vadeli değer; §3'teki temel buna hazır |

> Mevsimsellik notu: tercih dönemi yılda birkaç hafta. Model "soru" üzerine kurulu
> olduğu için kapsam **şema değişmeden** genişletilebilir (kayıt süreci, yurt, burs,
> yatay geçiş, Erasmus, staj). Feature'ın tek başına ürün olması değil, uygulamanın
> bir modülü olarak yaşaması hedeflenmelidir.

---

## 12. Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| Auth'suz yazma ucu (kayıt) | Spam/bot | IP limiti + Google SSO (bot maliyeti) + yayın öncesi insan onayı |
| KVKK — aday kişisel verisi | Hukuki | Aday kimliği yayınlanmaz, aydınlatma metni, veri minimizasyonu |
| Üniversite ↔ içerik çatışması | Tenant kaybı / güven kaybı | §6 politikası, denetim izi |
| `users` tablosunun iki sınıf taşıması | Rapor/sayım hataları | Rol veya `universityId IS NULL` ile ayrıştırma; dashboard sorguları gözden geçirilmeli |
| Public trafik profili | Ani yük | Cache + keyset sayfalama (ikisi de mevcut) |
