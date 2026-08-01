# Yönerge karşılaştırma tablosu

**Amaç:** Üniversitelerin öğrenci topluluğu/kulübü yönergelerinden **aynı soruları**
çıkarmak. Neyin **ortak** olduğu koda, neyin **değişken** olduğu `tenant_settings`'e
girer. PDF biriktirmek araştırma değildir — karşılaştırılabilir alanlar çıkarmak
araştırmadır.

**Hedef:** 8-10 üniversite. Çeşitlilik kasıtlı olsun: 2-3 vakıf, 3-4 büyük devlet,
2 küçük/yeni devlet, 1-2 teknik. Hepsi aynı profilden olursa "ortak" sandığımız şey
o profile özel çıkar.

**Kaynak ipucu:** `"öğrenci toplulukları yönergesi" site:edu.tr filetype:pdf` ·
SKS Daire Başkanlığı sayfalarındaki **başvuru formları** (yönerge ne yazdığını
söyler, form ne yapıldığını).

---

## A. Kuruluş

| # | Soru | Antalya Bilim | … | … |
| --- | --- | --- | --- | --- |
| A1 | Terim | **Topluluk** | | |
| A2 | Yetkili birim | Spor, Kültür ve Sanat Müdürlüğü | | |
| A3 | Kaç kurucu öğrenci? | **En az 8** | | |
| A4 | Danışman zorunlu mu? Ne zaman? | Zorunlu, **başvuruda** | | |
| A5 | Danışman kim olabilir? | Akademik **veya idari** personel | | |
| A6 | Danışman onayı nasıl? | **İmzalı muvafakatname** (SK-FR-0005) | | |
| A7 | İstenen belgeler | Tüzük, Yön. Kurulu listesi, Üye listesi, Muvafakatname | | |
| A8 | Benzer topluluk kuralı | Benzer olamaz; **birleştirilir** | | |
| A9 | Karar organı ve şekli | **Koordinasyon Kurulu — 5 üye, salt çoğunluk** | | |
| A10 | Ret'e itiraz hakkı | *(yönergede bulunamadı)* | | |

## B. Organlar ve roller

| # | Soru | Antalya Bilim | … | … |
| --- | --- | --- | --- | --- |
| B1 | Organlar | Genel Kurul, Yönetim Kurulu, Denetleme Kurulu | | |
| B2 | Yönetim kurulu kaç kişi? | **5** | | |
| B3 | Unvanlar | Başkan, Bşk. Yrd., Sekreter, Sayman | | |
| B4 | Başkan nasıl belirlenir? | Kuruluşta **danışman onayıyla atama**; sonra **seçim** | | |
| B5 | Seçim ne zaman? | Akademik yıl başı, ilk ayın sonuna kadar | | |
| B6 | Seçim belgesi | Oy kullananlar listesi + **seçim tutanağı** (SK-FR-0008) | | |
| B7 | Görev süresi | 1 akademik yıl | | |

## C. Üyelik

| # | Soru | Antalya Bilim | … | … |
| --- | --- | --- | --- | --- |
| C1 | Üyelik süreli mi? | **Her akademik yıl yenilenir** | | |
| C2 | Aidat var mı? | **Var** — yıllık/yarıyıllık, Genel Kurul saptar, SKS onaylar | | |
| C3 | Muafiyet | Yön. Kurulu önerisi + SKS onayı | | |
| C4 | Kimler üye olabilir? | Yalnızca öğrenciler; çoklu üyelik serbest | | |
| C5 | Toplanan kişisel veri | TC kimlik, adres, **fotoğraf**, ev tel, GSM, e-posta, imza | | |

## D. Faaliyet

| # | Soru | Antalya Bilim | … | … |
| --- | --- | --- | --- | --- |
| D1 | Önceden izin gerekiyor mu? | **Evet** — yıllık plan → kurul onayı | | |
| D2 | Süreç | Yıl başı taslak plan → Koordinasyon Kurulu → **yayımlanan takvim** | | |
| D3 | Plan formu alanları | Tür, konu, tarih, **tahmini bütçe, bütçe kaynağı** | | |
| D4 | Gerçekleşme takibi | Ayrı form; **gerçekleşmeme nedeni** soruluyor | | |
| D5 | Etkinlik sonrası rapor | Var — katılımcı sayısı, kazanımlar, problemler, görseller | | |
| D6 | Sponsorluk | Serbest ama sözleşme **1 hafta önce SKS onayı**; hukuki görüş | | |
| D7 | Gelir getirici faaliyet | **İzinli** (giderleri karşılamak için) | | |

## E. Mali ve yaşam döngüsü

| # | Soru | Antalya Bilim | … | … |
| --- | --- | --- | --- | --- |
| E1 | Bütçe takibi | **Kasa hesabı**; yıl sonu raporuyla teslim | | |
| E2 | Muhasebe entegrasyonu? | **Hayır** — belge teslimi yeterli | | |
| E3 | Faaliyetsizlik tanımı | Genel Kurul yılda 1 kez toplanmazsa **faaliyet dondurulur** | | |
| E4 | Kapatma yetkisi | Koordinasyon Kurulu (kural ihlali) veya **kendi feshi** | | |
| E5 | Kapanışta ne olur? | Evrak → SKS; **demirbaş** → İdari ve Destek Hizmetleri | | |
| E6 | Tüzük değişikliği | 1/3 teklif → **2/3 kabul** → Koordinasyon Kurulu onayı | | |
| E7 | Belge numaralandırma | `SK-FR-000X` + yayın tarihi + değişiklik no | | |

---

## Değerlendirme kuralı

Tablo dolduktan sonra her satır üç kutudan birine düşer:

- **Her üniversitede aynı** → koda gömülür (ör. "üyelik yalnızca öğrencilere açık")
- **Değişiyor ama aynı şekilde** → `tenant_settings` sayısal/liste ayarı
  (ör. kurucu sayısı 8 / 10 / 15)
- **Yapısal olarak farklı** → modelin kendisi genişlemeli
  (ör. sıralı onay zinciri ↔ kurul oylaması)

Üçüncü kutuya düşen her madde pahalıdır; bu yüzden tabloyu **karar vermeden önce**
doldurmak gerekiyor.
