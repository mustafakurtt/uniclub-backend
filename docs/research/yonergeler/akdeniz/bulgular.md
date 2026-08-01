# Akdeniz Üniversitesi — bulgular

**Kaynak:** `topluluk-isleyisi-genel-kurallar.pdf` → "Ders Dışı Öğrenci Faaliyeti
İşleyiş ile İlgili Genel Kurallar". Tam metin: `genel-kurallar-metin.txt`.
**Çıkarım:** 2026-08-01, pdfjs-dist.

> ⚠️ **Yönergenin tam metni hâlâ YOK.** Bu belge yönergeye atıf yapıyor
> ("MADDE 9 – c", "Yönerge eki Form 2/Form 3"). Kuruluş bilgileri aşağıda
> **SKS'nin SSS sayfasından** alındı (`sks.akdeniz.edu.tr/tr/s_s_s-2251`),
> iki ayrı sorguda birebir aynı ifadeyle doğrulandı. Organlar, seçim ve kapatma
> kuralları için yönergenin kendisi hâlâ gerekli.

---

## 0. Kuruluş — YÖNERGEDEN (asıl kaynak)

**MADDE 10:** *"Topluluk kurmak için topluluk iç tüzüğünün hazır olması ve
**en az üç farklı akademik birimde** aktif kayıtlı ve **disiplin cezası almamış
elli öğrencinin** başvurusu gerekir. Başvuru, kurucu üyeler tarafından **ıslak
imzalanan** başvuru formunun (Form 4) eklendiği dilekçenin, **akademik danışman
tarafından elektronik belge yönetim sistemi (EBYS) üzerinden** Daire Başkanlığına
sunulmasıyla yapılır."*

> ⚠️ **SSS sayfası yanlış/eski.** `sks.akdeniz.edu.tr/tr/s_s_s-2251` "en az 30
> (otuz) öğrenci" diyor; **yönerge 50 diyor** ve iki ek şart koyuyor (üç farklı
> akademik birim + disiplin cezası yok). **Yönerge esastır.**
> **Ders:** SSS/tanıtım sayfaları yönergeden kayar. Tabloyu her zaman yönergeden
> doldurun; SSS yalnızca ipucu.

**Kuruluş iki aşamalı (MADDE 10/5):** Değerlendirme Kurulu onay verdikten sonra
topluluk **60 gün içinde** genel kurulunu yapıp yönetim ve denetim kurulunu
oluşturmak zorunda; kurullar **7 gün içinde** bildirilir. *"Topluluk, bu kurulların
oluşturulması ve bildirilmesiyle kurulmuş olur."* → Konya'nın "geçici kuruluş"una
benzer ama ölçütü farklı (Konya: 1 yılda 3 etkinlik).

**Karar organı — yine KURUL (MADDE 6):** Değerlendirme Kurulu = rektör yardımcısı
(başkan) + Daire Başkanı + bir şube müdürü → **3 kişi**.
Antalya 5 kişilik kurul, Akdeniz 3 kişilik kurul, Konya sıralı zincir.

**Islak imza hâlâ var:** kurucu üyeler başvuru formunu ıslak imzalıyor. Yani
T1.1'de kurduğumuz "imza yerine dijital destek" tam da bu acıyı hedefliyor —
ama kurum EBYS kullandığı için dijital kanal zaten mevcut.

**EBYS entegrasyonu gerçek bir gereksinim:** başvuru EBYS üzerinden sunuluyor.
Yol haritasında T5.3 (resmî yazışma ve imza) "gerekli mi bilmiyoruz" durumundaydı
— **Akdeniz için gerekli.**

**İki yapısal fark:**

**a) Kurucu sayısı üçe katlanıyor.** Antalya Bilim **8**, Konya Teknik **15**,
Akdeniz **30**. Aralık geniş → `club.formation.support_threshold` ayarının
üst sınırı (şu an 500) rahat; ama varsayılanın kuruma göre çok değiştiği kesin.

**b) BAŞVURAN ÖĞRENCİ DEĞİL, DANIŞMAN.** Dilekçeyi danışman öğretim elemanı
hazırlıyor. Antalya ve Konya'da öğrenci başvuruyor, danışman yalnızca kabul
belgesi imzalıyor. Bizim modelimizde başvuran **her zaman öğrenci**
(`clubApplications.applicantId` → öğrenci). Akdeniz'de bu ters.

Aynı ters durum etkinlikte de var: **etkinlik ön talep formunu akademik danışman
dolduruyor**, kulüp değil.

→ Yani "kim başvurur" bile kurumdan kuruma değişiyor. Bu, rol modelimizi
etkileyen bir bulgu; tabloya ayrı satır eklendi.

## 0b. Üyelik ücretsiz — Antalya'nın tersi

> *"Üyelik tamamen ücretsizdir"* · *"Birden fazla topluluğa üye olmak mümkündür"*

Antalya Bilim'de **aidat var** (Genel Kurul saptar, SKS onaylar). Akdeniz'de yok,
çünkü masrafları üniversite karşılıyor. Bu, §6'daki bütçe farkının doğrudan
sonucu: devlet üniversitesinde para kurumda, vakıfta kulüpte.

Akdeniz **büyük bir devlet üniversitesi** ve Antalya bazlı ilerleme hedefimizde
pilot bölgedeki ikinci büyük oyuncu. Kuralları Antalya Bilim'den belirgin biçimde
daha **operasyonel** — çünkü ölçek büyük ve kamu bütçesine tabi.

---

## 1. Etkinlik izni sayısal ve iki kademeli

- Normal etkinlik: **en az 15 gün önce**
- Diğer üniversite/kurum katılımlı etkinlik: **en az 1 ay önce**
- Her ikisinde **Topluluk Danışmanının onayı ve imzası** şart
- Bildirim "Yürütme Birimi"ne yapılır (Yönerge eki **Form 2**)

→ Süre bir **tenant ayarı**; ama "kurum dışı katılımcı varsa süre uzar" kuralı
bizim modelimizde yok. Etkinliğin **kapsamına göre farklı önceden-bildirim süresi**
gerekiyor.

## 2. Etkinlik sonrası geri bildirim süreli

Üniversitelerarası veya ulusal düzeydeki faaliyetler için **bitimini izleyen
7 iş günü içinde** etkinlik değerlendirme formu (Form 3) verilir.

→ Antalya'da rapor var ama süre yok; Konya'da rapor yüklenmezse sonraki başvuru
bloke. Üç kurumda da **etkinlik sonrası rapor** var — bu **ortak**, koda girer.

## 3. Mekân rezervasyonunu KURUM yapıyor

Adlandırılmış salonlar: Atatürk Konferans Salonu, SKS Toplantı Salonu, Olbia A/B,
Sanat Galerisi, Olbia Açık Hava Tiyatrosu, Çok Amaçlı Salon, Dans Salonu,
Koro Salonu, Tiyatro Atölyesi. Rezervasyonu **Kültür Hizmetleri Şube Müdürlüğü
personeli** yapar; fakülte salonları için okul yönetimiyle görüşür.

→ **T2.4 (mekân rezervasyonu)** açık sorusunun cevabı: kulüp kendi rezerve
etmiyor, **kurum yapıyor**. Yani ürün "rezervasyon sistemi" değil, "talep +
kurum tarafından tahsis" akışı olmalı.

## 4. Afiş kuralları ve afiş onayı var

- Üniversite logosu afişin **sol üst köşesinde**
- Düzenleyen topluluk/kuruluşlar **hiyerarşik olarak sağa doğru** sıralanır
- Kurumsal Kimlik Kılavuzu'na uyulur
- **Afiş onayı için akademik danışmana imzalatılmalı**

→ Bizim afiş/QR özelliğimiz görsel üretiyor ama **marka kuralı ve onay adımı yok**.
Kurumsal kimlik kılavuzuna uymayan afiş kurumda kabul edilmiyor.

## 5. Ek belge gerektiren özel durumlar

- **Yurtiçi/yurtdışı etkinliğe katılım:** davet yazısı + dilekçe eki
- **Film/belgesel gösterimi:** telif sahibinden **izin belgesi** eki
- **Araç talebi:** Araç Tahsis Formu + Etkinlik Katılım Formu

→ Etkinlik başvurusu tek tip değil; **türüne göre farklı ek belgeler** istiyor.
Bizim modelimizde etkinliğin "türü" var ama türe bağlı belge gereksinimi yok.

## 6. Bütçe modeli Antalya'dan YAPISAL olarak farklı

Akdeniz: bütçe **kurumda**, harcamalar **5018 sayılı Kamu Mali Yönetimi Kanunu**
uyarınca yapılıyor. Kırtasiye, kostüm, enstrüman, demirbaş, harcırah ve yol
ücretleri bu bütçeden karşılanıyor. Tasarruf genelgeleriyle bazı alımlar
(çiçek, cafe break, plaket) yasaklanabiliyor.

Antalya Bilim (vakıf): topluluk **kendi kasa hesabını** tutuyor, gelir/giderini
belgeleyip yıl sonunda teslim ediyor.

→ **T4.6 (bütçe) için tek model yetmez.** Devlet üniversitesinde kulübün parası
yok, kurumun bütçesinden talep ediyor; vakıfta kulübün kendi kasası var.
Bu, tenant ayarıyla çözülecek bir sayı farkı değil — **iki farklı akış**.

Konuk yol gideri: fatura/e-bilet/katılım belgesi/taahhütname teslim edilir,
**damga vergisi ve hizmet bedeli kesilir**, konuğun beyan ettiği **IBAN**'a ödenir.

## 7. Dış yazışma yetkisi kulüpte değil

"Topluluklarla ilgili üniversite dışı yazışmalar Kültür Hizmetleri Şube
Müdürlüğü tarafından yapılır." Kulüp kurum dışına kendi adına yazamıyor.

## 8. Genel Kurul yılda en az 1 kez — Antalya ile AYNI

Yönetim kurulu eğitim-öğretim yılı başında SKS'ye bildirilir.

## 9. Üçüncü otomasyon kanıtı — ve bu sefer ZORUNLU

> "Topluluk üye kayıtları **mutlaka** http://topluluk.akdeniz.edu.tr adresinden
> yapılması gerekmektedir."

Ayrıca `mediko.akdeniz.edu.tr/topluluk/` altında topluluk listesi ve etkinlik
yayın sayfaları çalışıyor.

→ Antalya Bilim hariç incelenen **her iki devlet üniversitesinin de** çalışan bir
topluluk yazılımı var (Konya: "topluluk otomasyonu", Akdeniz: `topluluk.akdeniz.edu.tr`).
Pazar teorik değil; **rakip mevcut**. İkisine de bakılmalı.

---

## Eksik: Akdeniz yönergesinin kendisi

Kuruluş şartları (kurucu sayısı, onay mercii, organlar, üyelik, kapatma) bu
belgede yok. `sks.akdeniz.edu.tr` üzerinde yönerge sayfası var ama doğrudan PDF
bağlantısı bulunamadı. **Bir sonraki adım:** yönergeyi bul, karşılaştırma
tablosunun A/B/C/E bölümlerini doldur.

---

## 13. Organlar ve seçim (yönergeden)

- **Genel kurul** (MADDE 14): tüm üyelerden oluşur. Salt çoğunlukla toplanır;
  ilk toplantıda yeter sayı yoksa **en az iki gün sonra** yapılacak ikinci
  toplantıda çoğunluk aranmaz. Kararlar katılanların salt çoğunluğuyla;
  **oy eşitliğinde başkanın bulunduğu taraf çoğunluk sayılır.**
- **Divan kurulu**: başkan + iki yazman. Kararlar "genel kurul karar kayıt
  belgesi"ne (Form 6) yazılıp imzalanır.
- **Yönetim kurulu** (MADDE 15): genel kurul tarafından **bir yıl için** seçilir,
  **başkan dâhil beş asil + beş yedek**.
- **Denetim kurulu** ayrıca var.

→ **Yedek üye** kavramı bizde yok. Konya'da da geçiyordu ("yedek üyeler dâhil").
İki kurumda birden çıktığına göre gerçek bir ihtiyaç.

## 14. Afiş izni ZORUNLU ve sosyal medyayı da bağlıyor

MADDE 9(2): *"Topluluk tarafından düzenlenen etkinliklerin afişleri Daire
Başkanlığının iznine tabidir. İzin almamış etkinlik afişleri kullanılamaz.
Topluluğun sosyal medya hesaplarında etkinlik duyurulurken **sadece izin verilen
etkinlik afişi** kullanılır, bunun dışında reklam ve gelir amaçlı paylaşımlar
yapılamaz."*

→ Afiş onayı sadece basılı değil **dijital yayını da** kapsıyor. Bizim afiş/QR
özelliğimizde onay adımı yok.

## 15. Süreli yayın için editör kurulu ve telif

MADDE 9(3): bülten/dergi/gazete çıkarılabilir; akademik danışman + topluluk
başkanı + üye öğrencilerden **editör kurulu** oluşturulur, içerikten sorumludur.
Üçüncü kişilere ait eser/görsel/kimlik bilgisi kullanılıyorsa **izin alınır**.

## 16. Form seti (12 form) — bizde karşılığı olmayanlar

`1 Yıllık Faaliyet Planı` · `2 Etkinlik Talep` · `3 Etkinlik Geri Bildirim` ·
`4 Topluluk Kurma` · **`5 Üyelikten Ayrılma`** · **`6 Genel Kurul Toplantı
Tutanağı`** · **`7 Yönetim Kurulu Toplantı Tutanağı`** · `8 Araç Takip` ·
`9 Araç Talep` · `10 Topluluk Üyelik` · **`11 RİSK KABUL BEYANI`** ·
`12 Topluluk Üye Kayıt (xlsx)`

**Risk Kabul Beyanı** üç kurum içinde ilk kez çıkıyor: riskli etkinliklerde
katılımcıdan alınan sorumluluk beyanı. Bizde hiç yok ve hukuki karşılığı var.

**Toplantı tutanakları** (Form 6 ve 7) da bizde yok — oysa genel kurul ve yönetim
kurulu kararları bunlarla kayda geçiyor. T4.5 resmî çıktılar bunları üretebilmeli.
