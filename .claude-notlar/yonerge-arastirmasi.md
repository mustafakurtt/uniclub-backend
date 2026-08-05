---
name: yonerge-arastirmasi
description: "Üniversite yönergelerinden ortak/değişken yapı çıkarma araştırması — yöntem, bulgular, tuzaklar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-01T19:39:15.706Z
---

**Nerede:** `docs/research/yonergeler/` — `karsilastirma.md` (30 soruluk tablo,
beş bölüm) + üniversite başına `bulgular.md` ve çıkarılmış `*-metin.txt`.

**Amaç:** Neyin **ortak** olduğu koda, neyin **değişken** olduğu `tenant_settings`'e,
neyin **yapısal olarak farklı** olduğu modelin kendisine girer. Üçüncü kutu pahalı,
o yüzden karar vermeden önce tablo doldurulur.

**Kullanıcının hedefi:** pilot bölge **Antalya**, ana okul **Antalya Bilim**.

## Yöntem — ikisi de deneyle öğrenildi

1. **PDF metnini `pdfjs-dist` ile çıkar** (scratchpad'e kur, projeye bağımlılık
   ekleme). Elle `ToUnicode` CMap çözmek font çakışması yüzünden çöp üretiyor
   (`ÇONYA dVÇNÇ` = `KONYA TEKNİK`). `.docx` için zip+`word/document.xml` yeterli.
2. **Web arama/fetch araçlarının PDF özetine ASLA güvenme.** Konya için gelen özet
   tamamen uydurmaydı ("tipik yönetmelikler temelinde… 5-10 kurucu"); gerçek 15.
   Dosyayı indir, metni kendin çıkar.
3. **SSS/tanıtım sayfaları yönergeden kayıyor.** Akdeniz SSS'i "30 öğrenci" diyor,
   yönerge "elli öğrenci" diyor. **Yönerge esastır**, SSS yalnızca ipucu.

## n=3 bulgular (2026-08-01)

| | Antalya Bilim (vakıf) | Konya Teknik (devlet) | Akdeniz (devlet) |
| --- | --- | --- | --- |
| Kurucu | 8 | 15 | **50** (3 farklı birimden) |
| Karar | **Kurul**, 5 üye, salt çoğunluk | **Sıralı zincir** SKS→Koordinatörlük | **Kurul**, 3 üye |
| Aidat | Var | — | Yok (masrafı kurum karşılıyor) |
| Bütçe | Kulübün kasası | — | **Kurumda**, 5018 sayılı kanun |

**Modeli sarsan bulgular:**
- Onay şekli ikiye ayrılıyor: **kurul oylaması** (çoğunlukta) ↔ **sıralı zincir**.
  Bizim `approval_chain` yalnızca zinciri modelliyor.
- **Başvuran öğrenci olmayabilir**: Akdeniz'de dilekçeyi akademik danışman
  hazırlayıp **EBYS üzerinden** sunuyor. Bizde `applicantId` her zaman öğrenci.
- **Bütçe iki ayrı akış**: devlette para kurumda, vakıfta kulüpte. Tenant ayarıyla
  çözülmüyor.
- **Mekânı kurum tahsis ediyor** (Akdeniz), kulüp rezerve etmiyor → T2.4 bir
  "rezervasyon sistemi" değil, talep→tahsis akışı.
- Bizde hiç olmayanlar: risk kabul beyanı, toplantı tutanakları, yedek üye,
  deneme/geçici kuruluş, afiş onayı (sosyal medyayı da bağlıyor), türe bağlı ek
  belge (film→telif, yurtdışı→davet yazısı).

**Doğrulananlar:** kurucu sayısı ayarı doğru tasarlanmış · "düzeltme isteme"
sahada gerçek (Konya yönergesi birebir aynı üçlüyü yazıyor) · üyelik akademik yıl
bazlı (akademik dönem işini destekliyor) · faaliyetsizlik sayısal tanımlı.

**Pazar sinyali:** İncelenen iki devlet üniversitesinin de çalışan topluluk
yazılımı var (Konya "topluluk otomasyonu", Akdeniz `topluluk.akdeniz.edu.tr` —
üye kaydı **zorunlu** olarak sistemden). Pazar teorik değil, rakip mevcut.

## Yol haritasına işlendi (2026-08-01)

Bulgular artık `docs/planning/product-roadmap.md` içinde yaşıyor — araştırma
notu olarak kalmadı:

- **T1.6 Topluluk organları ve genel kurul** (yeni) — karar organı bizde yok;
  T1.3 devir teslimden **önce** yapılmalı
- **T3.6 Risk kabul beyanı** (yeni) — RSVP kapısı + kabul edilen metin sürümü
- **T4.2**'ye kurul↔zincir uyarısı · **T4.6**'ya iki bütçe akışı ·
  **T2.4**'e "talep→tahsis" · **T5.3**'e EBYS zorunluluğu
- **§9**'a araştırma özeti: cevaplanan beş açık soru, doğrulanan dört tasarım,
  dokuz model boşluğu

**Cevaplanan eski açık sorular:** bütçe (takip yeterli) · sponsorluk (kulüp bulur,
sözleşme önceden onaya tabi) · mekân (kurum tahsis eder) · resmî belge (EBYS
Akdeniz'de zorunlu) · faaliyetsizlik (sayısal tanımlı).

**How to apply:** Yeni yönerge geldiğinde tabloyu doldur, sonra üç kutuya ayır.
n=6-8 olmadan mimari karar verme — özellikle onay şekli (kurul↔zincir) ve bütçe
akışı için. Araştırma bulgusu yol haritasına işlenmeden "not aldık" sayma.
İlgili: [[urun-yol-haritasi-ve-durum]] · [[frontend-bilgi-mimarisi]]
