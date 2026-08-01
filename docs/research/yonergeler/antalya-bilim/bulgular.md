# Antalya Bilim Üniversitesi — Öğrenci Toplulukları Yönergesi: Bulgular

**Kaynak:** `ogrenci-toplulukları-yonergesi.pdf` (Form No SK-FR-0013, yayın 03.05.2018;
belgede 17.11.2021 tarihli 0072 revizyon izi var) + 9 resmî form.
**Çıkarım tarihi:** 2026-08-01. Metin, PDF'in `ToUnicode` haritaları çözülerek
çıkarıldı; bazı büyük harfler (Ü, Ö, İ) kayıp olabilir — **madde numaraları ve
sayılar güvenilir**, uzun alıntılar için PDF'e bakın.

> ⚠️ Bu **tek bir üniversite**. Aşağıdaki bulgular mimariyi değiştirmeden önce
> en az 5-6 yönerge daha ile karşılaştırılmalı. Amaç neyin **ortak** (koda girer)
> neyin **değişken** (tenant ayarına girer) olduğunu görmek.

---

## 1. En önemli bulgu: onay bir ZİNCİR değil, KURUL OYLAMASI

**MADDE 4:** Koordinasyon Kurulu = Spor, Kültür ve Sanat Müdürü (başkan)
+ **3 Topluluk Danışmanı** + Öğrenci Toplulukları Birim Yöneticisi → **5 üye**.
Yeni topluluk başvurularını inceler ve açılıp açılmayacağına **karar verir**.
Kararlarını **üyelerinin salt çoğunluğu ile** alır.

Bizim modelimiz (`club.application.approval_chain: ["advisor", "student_affairs"]`)
**sıralı rol onayı**. Kurul oylaması yapısal olarak farklı bir şey:

| | Bizim zincir | Gerçek kurul |
| --- | --- | --- |
| Karar birimi | Rol (sırayla) | Kişi (eşzamanlı) |
| Geçme şartı | Her kademe onaylar | Salt çoğunluk |
| Üyelik | Rol demeti | Adlandırılmış kurul üyeliği |
| Toplantı/yeter sayı | Yok | Var |
| Çekimser / katılmayan | Kavram yok | Oylamayı etkiler |

**Bu bir hata değil, eksik bir şekil.** Zincir modeli muhtemelen başka
üniversitelerde doğru. İhtiyacımız olan şey, `approval_chain` ayarının bir
**kademe tipini** taşıyabilmesi: `role_sequential` | `committee_majority`.

---

## 2. Kuruluş — MADDE 6

- **En az 8 öğrenci** (bizim `club.formation.support_threshold` bunu karşılıyor ✅)
- **Tüzük taslağı** zorunlu → bizde **belge eki kavramı yok** ❌
- **Danışman muvafakatnamesi** (imzalı kabul belgesi) zorunlu → bizde **danışman
  kabul akışı yok**, danışman tek taraflı atanıyor ❌
- Danışman **idari personel VEYA akademik personel** olabilir → bizim `advisor`
  rolü akademisyen varsayıyor ⚠️
- **Benzerlik kuralı:** önerilen topluluğun faaliyet alanı mevcut faal bir
  topluluğunkine benzer olamaz; benzer topluluklar Koordinasyon Kurulu tarafından
  **birleştirilir** → bizde ne benzerlik kontrolü ne birleştirme kavramı var ❌

Kuruluş talep formu ekleri: **Tüzük, Yönetim Kurulu Listesi, Üye Listesi,
Danışman Muvafakatnamesi** (4 belge).

## 3. Danışman gönüllülük esasına dayanır — MADDE 5

"Öğrencilerin danışmanlık **teklifini kabul eden** topluluk danışmanı, **gönüllülük
esasıyla** hareket ederek…"

Yol haritasındaki **T1.2** varsayımı ("akademisyen zorla atanamaz") **doğrulandı**
ve karşılığı resmî bir belge: `danisman-muvafakatnamesi.docx` (SK-FR-0005).

Danışmanın görevleri arasında: etkinlik planlama/bütçeleme yapıp SKS'ye **sunmak**,
gerekli **izin yazılarını** almak, faaliyetlerden **sorumlu olmak**.

## 4. Organlar ve roller — MADDE 10, MADDE 14

- **Genel Kurul** — topluluğun karar organı, tüm aktif üyelerden oluşur
- **Yönetim Kurulu** — 5 kişi
- **Denetleme Kurulu**

Formlardaki yönetim kurulu unvanları: **Başkan, Başkan Yardımcısı, Sekreter, Sayman**.

Bizim kulüp-içi rollerimiz: `president`, `officer`, `member`.
→ Başkan yardımcısı, sekreter, sayman **yok**; Genel Kurul ve Denetleme Kurulu
kavramları **hiç yok** ❌

**Başkanlık (MADDE 14):** Kuruluşta 5 kişilik yönetim kurulundan biri, **danışmanın
onayıyla** başkan olarak atanır ve SKS onaylar. Akademik yıl başında seçim
talep edilirse ilk ayın sonuna kadar yapılır. Başkanlık sona ererse **tek aday
olsa dahi seçim yapılır**; seçimi danışman ve SKS **birlikte** yürütür.
Belge: `topluluk-asil.docx` (SK-FR-0008) + **Ek-1 oy kullananlar listesi** +
**Ek-2 seçim tutanağı**.

→ Bizim `transfer-presidency` ucumuz **doğrudan devir** yapıyor. Gerçek süreç bir
**seçim** ve iki ekli tutanak üretiyor ❌

## 5. Üyelik DÖNEMSELDİR — MADDE 8

- Üyelik yalnızca öğrencilere açık; bir öğrenci birden çok toplulukta olabilir
- **Üyelik her akademik yılın başında yapılan kayıtlarla gerçekleşir** ve
  **her akademik yıl yenilenir**
- **Aidat**: yıllık ve/veya yarıyıllık; Genel Kurul saptar, SKS onaylar;
  Yönetim Kurulu önerisi + SKS onayı ile bazı öğrenciler **muaf** tutulabilir

→ Bizde üyelik **kalıcı**, yenileme yok, aidat yok ❌
→ **BE-13'ü (akademik dönem) doğruluyor**: üyelik dönem kapsamlı olmalı ✅

## 6. Faaliyetsizlik tanımı var — MADDE 10c

"Genel Kurul belirtilen sıklıkta toplanmadığı takdirde Spor, Kültür ve Sanat Müdürü
topluluk faaliyetlerini **dondurmak** yetkisine sahiptir."

Genel Kurul akademik yılda **en az bir kez** toplanmalı. Toplanmazsa faaliyet
dondurulur.

→ **T1.4 (faaliyetsizlik tespiti)** için somut, uygulanabilir bir kural ✅

## 7. Faaliyet süreci yıllık plan + kurul onayı — MADDE 7

Yönetim Kurulu her akademik yılın başında yıllık faaliyet programını **taslak
olarak** sunar → Koordinasyon Kurulu değerlendirir → onaylanan **faaliyet takvimi
web sitesinde yayımlanır**.

Form notu aynen: *"Bu formu eksiksiz doldurmuş olmanız faaliyetlerinizin onaylandığı
anlamına gelmez."*

Belgeler: `faaliyet-planı-bildirim.docx` (SK-FR-0007 — no, tür, konu, tarih,
**tahmini bütçe**, **bütçe kaynağı**), `faaliyet-gerceklestirme-formu.docx`
(SK-FR-0006 — gerçekleşti mi, **gerçekleşmeme nedeni**).

→ Bizde etkinlik anlık oluşturuluyor ve yayımlanıyor. **Yıllık plan → kurul onayı →
yayımlanan takvim** akışı yok ❌ (T2.5 etkinlik izin sürecinin gerçek şekli bu)

## 8. Bütçe ve sponsorluk — MADDE 12

- Topluluklar **kasa hesabı** tutar
- Tüm gelir/gider belgelenir ve **yıl sonu faaliyet raporuyla** SKS'ye teslim edilir
- **Sponsorluk sözleşmeleri faaliyetten bir hafta önce SKS'ye onaylatılır**;
  SKS gerekirse **hukuki görüş** alır

→ **T4.8 (sponsorluk)** açık sorusu cevaplandı: kulüp sponsor bulabiliyor ama
sözleşme önceden onaya tabi ✅
→ **T4.6 (bütçe)**: takip yeterli, muhasebe entegrasyonu gerekmiyor ✅

## 9. Fesih ve kapatma — MADDE 13

- Topluluk **Genel Kurul kararıyla kendini feshedebilir**
- Genel Kurallara uymayan topluluk **Koordinasyon Kurulu kararı ile kapatılabilir**
- Fesih/kapatma sonrası: bilanço ve evrak SKS'ye, **demirbaşlar** Muhasebe
  Müdürlüğü bilgisiyle İdari ve Destek Hizmetleri Müdürlüğü'ne teslim edilir

→ **T1.4** ve **T4.7 (envanter/demirbaş)** için somut kural ✅

## 10. Tüzük değişikliği — MADDE 9

Genel Kurul üye tam sayısının **1/3'ü** veya Yönetim Kurulu teklif eder →
Genel Kurul **2/3 çoğunlukla** kabul eder → **Koordinasyon Kurulu onayı** ile
yürürlüğe girer.

## 11. Resmî belge kontrolü

Her form altında: `Form No: SK-FR-000X  Yayın Tarihi:03.05.2018  Değ.No:0  Değ.Tarihi:-`

→ Ürettiğimiz PDF çıktıları **form numarası ve sürüm** taşımalı. Kurumsal doküman
yönetiminde numarasız belge kayda geçmez ⚠️

## 12. KVKK — formların topladığı veri

`topluluk-kurucu-ue-formu.docx`: **T.C. Kimlik No, Adres, Fotoğraf, Ev telefonu**,
GSM, e-posta, imza.
`uye-kayıt-formu.docx`: Ad/Soyad, Bölüm, Öğrenci No, Telefon, Üyelik Tarihi,
E-posta, İmza.

Bizde bu alanların hiçbiri yok (TC kimlik, fotoğraf, adres, telefon).
**Karar gerekiyor:** bunları toplamak mı, yoksa toplamayarak KVKK yükünü mü
azaltmak? Dijitalleşmenin bir faydası da gereksiz veri toplamayı bırakmak olabilir.

---

## Eksik kalan belgeler (bu üniversite için)

- **Genel Kurul toplantı tutanağı** şablonu (MADDE 10 gereği düzenleniyor olmalı)
- **Denetleme Kurulu** raporu şablonu
- **Etkinlik izin/başvuru** formu (MADDE 5c "gerekli izin yazıları" diyor)
- **Sponsorluk sözleşmesi** şablonu veya onay formu (MADDE 12)
- **Yıl sonu mali rapor** şablonu (MADDE 12 "gelir ve giderler … yıl sonu faaliyet
  raporu ile birlikte")
- **Demirbaş/envanter teslim** tutanağı (MADDE 13)
- Aidat tutarını belirleyen **SKS onay** belgesi

Bunlar süreci tamamlayan halkalar; varsa SKS'den istenebilir.
