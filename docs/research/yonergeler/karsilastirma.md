# Yönerge karşılaştırma tablosu

**Amaç:** Üniversitelerin öğrenci topluluğu yönergelerinden **aynı soruları** çıkarmak.
Neyin **ortak** olduğu koda, neyin **değişken** olduğu `tenant_settings`'e girer.
PDF biriktirmek araştırma değildir — karşılaştırılabilir alanlar çıkarmak araştırmadır.

**Hedef:** 8-10 üniversite. Çeşitlilik kasıtlı: 2-3 vakıf, 3-4 büyük devlet,
2 küçük/yeni devlet, 1-2 teknik.

**Metin çıkarma:** PDF'ler font alt kümesiyle kodlanıyor, elle çözmek güvenilmez.
`pdfjs-dist` ile çıkarın (kurulum scratchpad'de yeterli, projeye bağımlılık eklemeyin):

```ts
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
// sayfa sayfa getTextContent() → it.str, it.hasEOL
```

> ⚠️ **Web arama araçlarının PDF özetine güvenmeyin.** Konya yönergesi için alınan
> ilk özet tamamen uydurmaydı ("tipik yönetmelikler temelinde… 5-10 kurucu üye").
> Gerçek sayı **15**. Metni her zaman kendiniz çıkarın.

---

## A. Kuruluş

| # | Soru | Antalya Bilim (vakıf) | Konya Teknik (devlet) |
| --- | --- | --- | --- |
| A1 | Terim | Topluluk | Topluluk |
| A2 | Yetkili birim | Spor, Kültür ve Sanat Müdürlüğü | SKS Daire Başkanlığı + **Öğrenci Toplulukları Koordinatörlüğü** |
| A3 | **Kaç kurucu öğrenci?** | **8** | **15** |
| A4 | Danışman zorunlu mu? | Evet, başvuruda | Evet, başvuruda |
| A5 | Danışman kim olabilir? | Akademik **veya idari** personel | Akademik danışman |
| A6 | Danışman onayı | İmzalı muvafakatname (SK-FR-0005) | "Üstlenme formu" (OTK-003) |
| A7 | İstenen belgeler | Tüzük, Yön. Kurulu listesi, Üye listesi, Muvafakatname | Kurucu listesi (OTK-001), Tüzük (OTK-002), Danışman formu (OTK-003), **1 yıllık faaliyet planı** |
| A8 | Benzerlik kuralı | Benzer olamaz; **birleştirilir** | — |
| A9 | **Karar şekli** | **KURUL OYLAMASI** — Koordinasyon Kurulu 5 üye, salt çoğunluk | **SIRALI ZİNCİR** — SKS → Koordinatörlük, her kademe onay/**düzeltme**/ret |
| A10 | Ret'e itiraz | **Yok** (yönergede geçmiyor) | Başvuru reddine yok; **üyelikten çıkarmaya var** |
| A11 | Deneme süresi | Yok | **Var** — geçici kuruluş, 1 yılda 3 etkinlik → resmî kuruluş |
| A12 | Kuruluş sonrası | — | 1 ay içinde Genel Kurul toplanıp Yönetim Kurulu seçer |

## B. Organlar ve roller

| # | Soru | Antalya Bilim | Konya Teknik |
| --- | --- | --- | --- |
| B1 | Organlar | Genel Kurul, Yönetim Kurulu, Denetleme Kurulu | Genel Kurul, Yönetim Kurulu, Denetim Kurulu |
| B2 | Yönetim kurulu | 5 kişi | *(yedek üyeli)* |
| B3 | Unvanlar | Başkan, Bşk. Yrd., Sekreter, Sayman | — |
| B4 | Başkan nasıl belirlenir? | Kuruluşta danışman onayıyla **atama**, sonra seçim | Genel Kurul **seçimi** |
| B5 | Seçim zamanı | Akademik yıl başı, ilk ay sonuna kadar | Kuruluştan 1 ay içinde |
| B6 | Seçim belgesi | Oy kullananlar listesi + **seçim tutanağı** | — |

## C. Üyelik

| # | Soru | Antalya Bilim | Konya Teknik |
| --- | --- | --- | --- |
| C1 | Üyelik süreli mi? | **Her akademik yıl yenilenir** | — |
| C2 | Aidat | **Var** — Genel Kurul saptar, SKS onaylar | — |
| C3 | Muafiyet | Yön. Kurulu önerisi + SKS onayı | — |
| C4 | Kimler üye olabilir? | Yalnızca öğrenciler; çoklu üyelik serbest | Öğrenciler |
| C5 | Toplanan kişisel veri | TC kimlik, adres, **fotoğraf**, ev tel, GSM, e-posta, imza | TC kimlik, öğrenci no, cep telefonu, **adres** |
| C6 | Üyelikten çıkarma | — | Yön. Kurulu kararı; **Koordinatörlüğe itiraz hakkı** |
| C7 | Asgari üye sayısı | — | **15'in altına düşerse kendiliğinden sona erer** |

## D. Faaliyet

| # | Soru | Antalya Bilim | Konya Teknik |
| --- | --- | --- | --- |
| D1 | Önceden izin | **Evet** | **Evet** |
| D2 | Süreç | Yıl başı taslak plan → Koordinasyon Kurulu → **yayımlanan takvim** | Yıllık plan otomasyona yüklenir; etkinlik başına başvuru dosyası |
| D3 | Plan formu alanları | Tür, konu, tarih, **tahmini bütçe, bütçe kaynağı** | — |
| D4 | Etkinlik sonrası rapor | Var (katılımcı sayısı, kazanımlar, problemler, görseller) | **Zorunlu** — rapor + görsel |
| D5 | **Rapor yüklenmezse?** | — | **Bir sonraki etkinlik başvurusu dikkate alınmaz** |
| D6 | Sponsorluk | Serbest; sözleşme **1 hafta önce** SKS onayına; hukuki görüş alınabilir | Serbest; sözleşme formu **otomasyona** yüklenir |
| D7 | Gelir getirici faaliyet | İzinli | — |

## E. Mali ve yaşam döngüsü

| # | Soru | Antalya Bilim | Konya Teknik |
| --- | --- | --- | --- |
| E1 | Bütçe takibi | Kasa hesabı; yıl sonu raporuyla teslim | — |
| E2 | Muhasebe entegrasyonu | **Hayır** | — |
| E3 | **Faaliyetsizlik tanımı** | Genel Kurul yılda 1 kez toplanmazsa **faaliyet dondurulur** | **Yılda en az 3 faaliyet**; yoksa yazılı uyarı |
| E4 | Kapatma | Koordinasyon Kurulu kararı veya kendi feshi | **İki uyarı → Rektör kararı**; ayrıca amaç sapması/mevzuata aykırılık |
| E5 | Kapanışta ne olur? | Evrak → SKS, **demirbaş** → İdari ve Destek Hizmetleri | Mal varlığı diğer topluluklara veya SKS'ye |
| E6 | Tüzük değişikliği | 1/3 teklif → **2/3 kabul** → Koordinasyon Kurulu onayı | — |
| E7 | Belge numaralandırma | `SK-FR-000X` formlar; yönergeler ortak `ÜY-FR-0013` şablonu | `OTK-00X` |

---

## Akdeniz Üniversitesi (devlet, büyük — pilot bölge)

Yönergenin kendisi henüz elimizde yok; elimizdeki "Genel Kurallar" belgesi
**operasyonel** kuralları veriyor. Ayrıntı: [akdeniz/bulgular.md](akdeniz/bulgular.md).

| Alan | Akdeniz |
| --- | --- |
| D1 Etkinlik izni | **Evet** — normal **15 gün**, kurum dışı katılımlı **1 ay** önce, danışman imzalı |
| D4 Etkinlik sonrası rapor | **7 iş günü** içinde değerlendirme formu (Form 3) |
| D6 Sponsorluk | Etkinlik öncesi Kültür Şube'ye bilgi |
| **Mekân** | **Kurum rezerve ediyor** — adlandırılmış salonlar, SKS personeli yapıyor |
| **Afiş** | Logo sol üstte, düzenleyenler hiyerarşik; **danışman imzasıyla onay** |
| **Ek belgeler** | Yurtdışı: davet yazısı · Film: **telif izni** · Araç: tahsis formu |
| E1 Bütçe | **Kurumda** — 5018 sayılı kamu mali yönetimi kanunu kapsamında |
| E3 Genel Kurul | Yılda en az 1 kez (Antalya ile aynı) |
| Otomasyon | **`topluluk.akdeniz.edu.tr` — üye kaydı ZORUNLU olarak sistemden** |

## İlk sentez (n=3 — bağlayıcı değil)

**1. Onay şekli yapısal olarak ikiye ayrılıyor.** Antalya bir **kurul oylaması**
(5 üye, salt çoğunluk), Konya bir **sıralı zincir** (SKS → Koordinatörlük).
İkisi de gerçek. Bizim `club.application.approval_chain` ayarımız Konya'yı **doğru
modelliyor**; Antalya için kademe tipinin `committee_majority` olabilmesi gerekiyor.
Bu, tabloyu doldurdukça netleşecek en pahalı madde.

**2. Kurucu sayısı gerçekten değişken** (8 ↔ 15) — `club.formation.support_threshold`
ayarı doğru tasarlanmış. ✅

**3. "Düzeltme isteme" gerçek bir kurumsal adım.** Konya yönergesi aynen şöyle diyor:
*"onay verebilir, düzenleme isteyebilir ya da ret cevabı verir."* Bizim T4.1
revizyon akışımız uydurulmuş değil, sahadaki üçlü karar kümesinin birebir karşılığı. ✅

**4. Konya'nın zaten bir "topluluk otomasyonu" yazılımı var** ve yönerge onun
etrafında yazılmış (*"sisteme yüklenmesi gerekir"*, *"otomasyon üzerinden onay"*).
Yani bu ürünün pazarı **teorik değil** — kurumlar bu işi yazılımla yapmaya çalışıyor.
Rakip analizi için bakılmalı.

**5. Faaliyetsizlik iki kurumda da tanımlı ama farklı ölçülüyor:** Antalya
"Genel Kurul yılda 1 kez toplanmalı", Konya "yılda en az 3 faaliyet". İkisi de
sayısal → tenant ayarı. ✅

**6. Yeni kavramlar (ikisinde de bizde yok):** deneme/geçici kuruluş dönemi,
asgari üye sayısının altına düşünce kendiliğinden sona erme, rapor yüklenmezse
sonraki başvurunun bloke olması, uyarı → ikinci uyarı → kapatma merdiveni.

**7. Kişisel veri deseni ortak:** ikisi de TC kimlik + adres + telefon istiyor.
Kâğıt süreçte standart. **Karar:** dijitalde bunları toplamak zorunda mıyız?
Öğrenci numarası + kurumsal e-posta kimliği zaten doğruluyor.

**8. Bütçe modeli tenant ayarıyla çözülmüyor — iki AYRI AKIŞ.**
Akdeniz (devlet): para **kurumda**, 5018 sayılı kamu mali yönetimi kanunu geçerli,
kulüp talep ediyor. Antalya Bilim (vakıf): kulübün **kendi kasa hesabı** var.
Bu bir sayı farkı değil; T4.6 iki modeli de desteklemek zorunda. Devlet/vakıf
ayrımının başka yerlerde de çıkması muhtemel — tabloya bu sütunu ekleyin.

**9. Mekân rezervasyonu kulüpte değil, kurumda.** Akdeniz'de salonları SKS
personeli tahsis ediyor. T2.4 bu yüzden bir "rezervasyon sistemi" değil,
**talep → kurum tahsisi** akışı olmalı.

**10. Etkinlik izni tek süre değil, kapsama bağlı.** Akdeniz: normal 15 gün,
kurum dışı katılımlı 1 ay. Bizim modelimizde etkinliğin türü var ama **türe bağlı
önceden-bildirim süresi ve türe bağlı ek belge** yok (film → telif izni,
yurtdışı → davet yazısı).

**11. Afişin marka kuralları ve onay adımı var.** Logo konumu, düzenleyen
sıralaması, kurumsal kimlik kılavuzu, ve **danışman imzalı afiş onayı**.
Bizim afiş/QR özelliğimiz görsel üretiyor ama bu katmanı hiç bilmiyor.

**12. Rakip var ve pazar kanıtlandı.** İncelenen iki devlet üniversitesinin de
çalışan topluluk yazılımı var: Konya "topluluk otomasyonu", Akdeniz
`topluluk.akdeniz.edu.tr` (üye kaydı **zorunlu** olarak sistemden). İkisi de
incelenmeli — hem rakip analizi hem de "kurum bu işi yazılımla yapmak istiyor"
kanıtı.

---

## Değerlendirme kuralı

Tablo dolduktan sonra her satır üç kutudan birine düşer:

- **Her üniversitede aynı** → koda gömülür
- **Değişiyor ama aynı şekilde** → `tenant_settings` sayısal/liste ayarı
- **Yapısal olarak farklı** → modelin kendisi genişlemeli (pahalı — bu yüzden
  karar vermeden önce tabloyu doldurmak gerekiyor)
