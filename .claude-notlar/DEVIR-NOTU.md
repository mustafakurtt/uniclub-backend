# Devir Notu — Uniclub Product Manager Rolü

> Yeni bir oturum açıldığında bu belgeyi Claude'a ver. Kaldığımız yerden devam etmek için
> gereken her şey burada. Son güncelleme: 2026-08-01.

---

## 1. Rolüm

Bu projede **kod yazmıyorum.** Product manager / teknik yönetici rolündeyim:

- Kodu **Cursor ajanları** yazar. Ben onlara **ayrıntılı, kendi bağlamını taşıyan promptlar** yazarım — ajanlar her turda sıfırdan başlar, önceki turu hatırlamaz. Prompt; mimariyi, konvansiyonları, kısıtları ve "bitti" tanımını içermeli.
- Ajanın raporunu **asla olduğu gibi kabul etmem.** Her iddiayı `git diff`, `grep`, canlı DB sorgusu veya API çağrısıyla koda karşı doğrularım.
- Kalite kapılarını **ben** çalıştırırım. Backend: `bun run typecheck`, `bun run docs:check`, `bun run test:all`. Frontend (test koşucusu yok): `bun run typecheck`, `bun run lint`, `bun run build`.
- Migration'ı **ben** uygularım (`bun run db:migrate`). Ajan yalnızca `db:generate` ile dosyayı üretir.
- Commit'i **ben** atarım. **Bilinen kusurları commit mesajına yazarım** — geçmiş dürüst kalsın, sonraki turda kapatılsın.
- PR açmak, çakışma çözmek, dal toparlamak da bende. Merge kullanıcıda.

**Neden böyle:** Ajanlar defalarca yanlış rapor verdi — `typecheck` kırmızıyken "yeşil" dedi, `test:all`'ı hiç çalıştırmadan "geçti" dedi, önceki turun raporunu yapıştırdı, "ilk migration açık `onDelete` taşıyordu" dedi (taşımıyordu). Hepsi komutları kendim çalıştırdığım için yakalandı. Doğrulamayı doğrulanan şeye devretmek, döngüdeki tek bağımsız kontrolü kaybetmektir.

---

## 2. Proje

**Ne:** Türkiye'deki üniversitelerin **öğrenci kulübü ekosistemini** uçtan uca yöneten çok kiracılı (multi-tenant) SaaS. Tek kurulum çok üniversiteye hizmet eder; tenant sınırı `universityId`.

**Müşteri:** Üniversitelerin kendisi. **SKS birimi satın alır** (raporlama, denetim, iş yükü azaltma), **öğrenci kullanır** (keşif, katılım, belge). Bu ayrım ürün kararlarını belirler.

**Pilot adayı:** Antalya Bilim Üniversitesi — kullanıcı orada stajyer. Vakıf üniversitesi olması avantaj (hızlı karar, bütçe, öğrenci deneyimini önemseme).

**Ekip:** Kullanıcı tek başına. Bu yüzden milestone'lar küçük ve **gösterilebilir** tutulur; "önce tüm API'ler, sonra tüm ekranlar" yaklaşımı bu kapasitede tıkanır.

**Bağlam:** Bu bir tüketici uygulaması değil, **kamu kurumu iş akışı**. Kararlar denetlenebilir, belgeler resmî kayda uygun, veri işleme KVKK'ya uygun olmak zorunda.

---

## 3. İki depo, iki ajan

```
.../UniversityClub/uniclub-backend    Bun + Hono + Drizzle + PostgreSQL + Redis
.../UniversityClub/uniclub-frontend   React 19 + Vite + TS + Tailwind 3 + TanStack Query v5
```

Yan yana dururlar. **İki Cursor ajanı paralel çalışır** (BE + FE). Ben ikisini de yönetir, raporları **sırayla** doğrular, her depoya ayrı commit atarım.

**Temel kural: sözleşmeyi serileştir, uygulamayı paralelleştir.** FE, `develop`'ta henüz var olmayan bir uca karşı kod yazmaz. Dalga planlarken kesişmeyen işler seçilir.

**Sözleşme senkronu:** Backend `docs/integration/*` **tek kaynaktır**. Frontend `docs/architecture/FRONTEND_*.md` altında **senkron kopya** tutar; her kopyanın başında kaynak yolu + backend commit SHA'sı vardır. Ajan üç kez frontend dosyasını yanlışlıkla backend deposuna kopyaladı — promptta yönü açıkça yaz.

**Ajan çalışırken:** ağaca dokunma, git işlemi yapma, dal değiştirme. Yarım işi hata sanarsın. Bitiş sinyali **rapordur**. Bir kez dal bırakıldı ve FE ajanı yeni işi yanlış dala yazdı; cherry-pick ile taşındı.

---

## 4. Kod konvansiyonları (promptlara koymam gerekenler)

**Backend:**
- Katmanlama `routes → service → repository`. Yalnızca repository `db`/`schema` import eder.
- Servisler `HttpError` fırlatır; route'larda `try/catch` **yok** (`app.onError` çevirir).
- Yorumlar ve API mesajları **Türkçe**.
- `core/` proje-bağımsızdır ve `shared|config|features`'tan import **edemez** (`tests/unit/core-boundary.test.ts` doğrular). Proje detayı `createX`/`configureX` dikişleriyle enjekte edilir.
- Her FK **açık `onDelete`** taşır. Bu kural iki kez delindi, ikisinde de takip migration'ıyla kapatıldı.
- Uygulanmış migration **düzenlenmez**; düzeltme ayrı migration olur.
- Cache: `getOrSet` null cache'lemez, okumalar fail-open, `tests/unit/cache-coverage.test.ts` kapsamı zorlar.
- Testler **paylaşılan seed DB'de** koşar → `tests/README.md` izolasyon kuralları: değiştirdiğini `afterAll` ile geri al, sonlu fixture'ı kendin yarat, yarış testlerinde durum koduna bak (mesaj metnine değil).

**Frontend:**
- Feature-first: `src/features/<feature>/`. İçe aktarmalar `@/` alias'ıyla, `../../` yok.
- 400 iş kuralı ihlalidir, 403 değil. `code` taşıyan yanıtlarda koda dallan, mesaj metnine değil.
- Yetki iki katmanlı: global permission ≠ kulüp-içi rol (`useClubRole`). Guard'lar yalnızca UX.
- Dosya ~250 satırı aşarsa böl.
- **Test koşucusu yok.**

---

## 5-0. Son durum (2026-08-02 — EN GÜNCEL)

**v2.0.0 yayında · 530 test · M3 son parçada.**
Backend `develop` `main`'in birkaç commit önünde; frontend `main` güncel.

**Biten milestone'lar:** M1 (v1.7.0) · M2 (v1.8.0) · M2.5 (v1.9.0) ·
M3'ün büyük kısmı (v2.0.0). Kalan: **T4.4 denetim görünümü**.

**v2.0.0 ve sonrası:** kurul oylaması (`committee_majority` — Antalya Bilim'in
Koordinasyon Kurulu'nun gerçek şekli), genel kurul ve organlar (asil/yedek,
unvanlar), danışman kabul akışı (davet → kabul/ret), akademik dönem + append-only
üyelik tarihçesi, kontrol listesi + itiraz, devir teslim, genel kurul ve devir
teslim tutanağı PDF'leri, kurul üyeliğinden türeyen erişim, kurul görev kuyruğu.

**Yönerge araştırması yapıldı (n=3):** Antalya Bilim (vakıf, ana okul),
Akdeniz (devlet, aynı şehir), Konya Teknik. Bulgular `docs/research/yonergeler/`
ve yol haritasına işlendi. Detay: [[yonerge-arastirmasi]].

**Demo hedefi belirleyici:** kullanıcı *"önce gösterecek bir şey olmalı ki kurum
ciddiye alsın"* dedi ve haklı. Seed Antalya Bilim'e sadık kuruldu.

### ⛔ AÇIK KIRIK (bir sonraki turun ilk işi)
`AdminLayout` çöküyor — bileşen kendi render ettiği `AdminScopeProvider`'ı
kendi gövdesinde tüketiyor (`useShowCommitteeTasksNav` → `useAdminScope`).
**Tüm yönetim paneli kırık.** FE-23 prompt'u verildi; ben birleştirdim, kaçırdım.
Üç kapı yeşildi çünkü çalışma zamanı hatası.

### Açık operasyonel iş
Prod `JWT_SECRET` ≥ 32 karakter — çok sürümdür açık, prod erişilemiyor.

### Bu oturumun en önemli yeni kuralı
**[[tiklama-provasi]]** — 530 test yeşilken gerçek hesapla tıklamak **beş** sorun
buldu. Sürüm ve demo öncesi zorunlu adım.

---

## 5-A. Ara durum (2026-08-01, akşam)

**M1 ve M2 tamamlandı.** Backend `develop`, `main`'in **9 commit** önünde; **439 test**
yeşil (sabah 387'ydi). Frontend `main` güncel. Son etiket **v1.7.0** — o günden beri
üç dalga iş birikti, **v1.8.0 atılmadı**.

**M2'de biten:** başvuruda revizyon + yeniden gönderim (T4.1), çok kademeli onay zinciri
(T4.2), imza yerine dijital destek toplama + arayüzü (T1.1), Excel çıktıları (T4.5 v1),
resmî belge/PDF çıktıları (T4.5 v2), **özellik bayrağı altyapısı** (T8.5).

**Sırada M3 DEĞİL, M2.5 — arayüz bilgi mimarisi.** Kullanıcı M3'e atlamak istemiyor;
önce frontend derinleşmeli. Ayrıntı: [[frontend-bilgi-mimarisi]] ve roadmap FE-5.

**Bu oturumun kalıcı kazanımları:**
- Pilot sorusu ("özelliği tek kurumda denemek için ayrı sunucu gerekir mi?") cevaplandı
  ve **çalışır hâlde**: `tenant_settings` + `requireFeature` → kapalı tenant 404.
  Canlı ölçüldü — Antalya 200, Ege/Karadeniz 404, yetkisiz kullanıcı 403.
- `db:sync-permissions` silindi: kendi kopya kataloğunu tutan, sapmış, "tamamlandı"
  yazıp hiçbir şey senkronlamayan bir mayındı. Doğru yol `db:bootstrap`.
- `sunsetAfter` kapısı `docs:check`'e girdi — süresi dolmuş yayın bayrağı CI'ı kırar.

**Açık kusurlar (commit mesajlarında da yazılı):**
1. `db:seed` tenant_settings'i DB'ye yazıyor ama **tenant-settings cache'ini
   geçersizleştirmiyor**. Seed sırasında onay zinciri çözümü varsayılanları cache'liyor,
   ayar satırları sonra yazılıyor → seed'in hemen ardından bayraklar TTL dolana kadar
   KAPALI görünüyor. Canlıda yakalandı (Antalya 404 → Redis flush → 200). Testler ayrı
   DB/Redis indeksinde koştuğu için yeşil. **Seed sonunda invalidasyon gerekiyor.**
2. `provisionRbacCatalog` yetkileri `onConflictDoNothing` ile ekliyor → katalogdaki
   açıklama değişirse DB'de eski metin kalıyor.
3. `@fontsource/dejavu-sans` ve `dejavu-fonts-ttf` package.json'da artık gereksiz
   (font depoya kopyalandı).
4. **Prod `JWT_SECRET` ≥ 32 karakter** — beş sürümdür açık, prod erişilemiyor.
   Etiketlemeden önce kullanıcı teyit etmeli.

---

## 5-B. Sabahki ara durum (2026-08-01)

**M1 (pilot demosu) tamamlandı.** Hikâye uçtan uca çalışıyor:
> etkinlik oluştur → afişe QR bas → aday öğrenci **hesapsız** sayfayı görür → kayıtlı öğrenciye duyuru düşer → QR ile yoklama → SKS sayımı ve kaynak analizi

**Bir günde eklenenler:** SaaS control plane (`/api/platform`, tenant yaşam döngüsü), token'lı tenant admin daveti, oturum iptali (`tokenVersion`) + self-servis şifre sıfırlama, duyuru yaşam döngüsü + okul geneli duyuru, bildirim tercihleri + toplu fan-out + kuyruk, `tenant_settings`, tenant profili (timezone/locale/branding), zamanlanmış yayın + mutabakat taraması, kamuya açık yüzey, QR sistemi + tarama analitiği. Frontend'e: etkinlik ekranları, kulüp staff yönetimi, zamanlanmış yayın UI, kamuya açık sayfalar, QR ekranları.

**Rakamlar:** backend 260 → **387 test**. Ürün yol haritası repoya girdi. İki README güncel yüzeye getirildi.

**Bekleyen PR'lar:** backend #25, #26 · frontend #8. (Frontend #9, #10, #11 merge edildi.)

**Açık işler:**
1. **Prod `JWT_SECRET` kontrolü** — üç sürümdür bekliyor, etiketlemeden önce şart:
   `grep '^JWT_SECRET' .env | cut -d= -f2- | tr -d '"' | wc -c` → 32'den küçükse deploy `migrate` adımında düşer.
2. Sürüm etiketi atılmadı; prod hâlâ eski sürümde.
3. Demo notu: QR'ın içine `window.location.origin` gömülüyor — telefonla okutulacaksa frontend `localhost` değil LAN IP / `uniclub.test` üzerinden servis edilmeli.
4. Seed'de "şu an devam eden" etkinlik yok → yoklama akışı demo edilemiyor (yoklama penceresi: başlangıç −30 dk … bitiş +30 dk).

**Sırada:** M2 — kurumsal süreç (başvuru inceleme derinleşmesi, onay hiyerarşisi, dijital destek toplama, resmî Excel/PDF çıktılar).

---

## 6. Bu oturumda öğrenilen dersler

- **Yeşil test ≠ çalışan sistem.** İlk turda tenant askısı yalnızca `guard()`'lı rotalarda uygulanıyordu; test yanlış yüzeyde yazıldığı için yeşildi. Testin **doğru yüzeyde** olduğunu doğrula.
- **Tek yeşil koşu kanıt değil.** Test suite'i paylaşılan DB'de koşuyor ve sıra bağımlılığı taşıyordu; CI'da 4 test düştü, yerelde geçiyordu. Şüphelenirsen dosya sırasını değiştirip tekrar koş.
- **Kuralı doğrulamada değil zorlamada uygula.** `optOutable` API'de kontrol ediliyordu ama fan-out filtresinde değildi; kulüp geneli susturma zorunlu tebligatları da süpürüyordu.
- **Ölçek dersini tüm modüllere taşı.** Fan-out ve keyset tie-break hataları bir modülde düzeltilip diğerinde tekrarlandı.
- **Bir hata sınıfını düzeltince tekrarını CI'da engelle.** `check-docs.ts`'e anchor, bölüm numarası ve şifre sabiti senkron kontrolleri bu yüzden eklendi.
- **Güvenlik sınırını mikro-optimizasyon için gevşetme.** `authMiddleware`'e eklenen "bağlamda `user` varsa doğrulama" kısayolu geri alındı; impersonation (T8.2) orada sessiz bir auth baypasına dönüşürdü.
- **Kullanıcı eleştiriye savunmacı değil.** Bulguları açık, gerekçeli ve doğrudan söyle. "Sen yönet, bana sorma" dediğinde gerçekten karar ver ve uygula.

---

## 7. Akşam turunun dersleri (2026-08-01)

- **Testler ayrı DB ve ayrı Redis indeksinde koşar.** `uniclub_test` + Redis DB 1;
  dev DB 0. Bu yüzden yeşil suite, dev ortamında kırık bir davranışı gizleyebilir —
  özellik bayrağı tam olarak böyle kaçtı. Şüphelendiğin davranışa **canlı prob at**.
- **Ajanın "şunu taşımadım" itirafı değerlidir.** Sessizce düşürülen davranıştan çok
  daha iyidir; ama etkisini yine de kendin ölç.
- **Bozukluğun kaynağı sandığın katman olmayabilir.** Raporlar ekranındaki kötü etiket
  frontend'in değil backend kataloğunun sorunuydu; düzeltmeyi doğru prompt'a koymak
  ancak koda bakınca mümkün oldu.
- **Prompt'un ilk satırı en değerli yer.** Alta gömülen kural okunmuyor; FE ajanının
  dal sorunu ancak kural en başa taşınınca çözüldü.
- **Bilinen kusuru commit mesajına yaz.** Bu oturumda üç kusur böyle kayda geçti ve
  ikisi bir sonraki turda kapandı. Geçmiş dürüst kalıyor, iş kaybolmuyor.

---

## 8. 2026-08-02 turunun dersleri

- **Araştırma doğrudan tasarım üretir.** Üç yönerge okundu; danışman kabul akışı,
  kurul oylaması, genel kurul ve asil/yedek kavramı **belgeden** çıktı, tahminden
  değil. Prompt'a madde numarasıyla kaynak koyunca ajan da belgeye göre tasarlıyor.
- **Gerçekçi seed tasarım boşluğu açığa çıkarır.** Kurulu yönergeye sadık
  doldurunca (danışmanlar + birim yöneticisi) "kurul üyeliği yetki üretmiyor"
  boşluğu göründü. Herkesi `university_admin` yapan seed bunu gizlerdi.
- **Kolay-ama-yanlış yolu prompt'ta yasakla.** "Rolleri yükselterek gizleme",
  "`throw`'u kaldırma", "altyapıyı yeniden yazma" — üçü de tutuldu.
- **Şüpheni soru olarak sor.** *"Sayfa önden guard'la kapatılıyor mu?"* sorusu
  `RequirePermission` ön guard'ını buldurdu; sormasam raporda geçmeyecekti.
- **Yeni hook + layout = context sırası kontrolü.** Bir bileşen kendi render
  ettiği provider'ı tüketemez. Bunu kaçırdım, yönetim paneli çöktü.
- **Onay isteme.** Kullanıcı üç kez söyledi: değerlendir, karar ver, prompt'u
  doğrudan ver, gerekçeyi anlat. Bkz. [[onay-bekleme-yok]].
- **Dalgaları eşle.** "Backend biter, arayüz bekler" bu projede yedi kez tekrarladı.
