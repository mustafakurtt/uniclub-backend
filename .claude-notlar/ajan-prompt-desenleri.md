---
name: ajan-prompt-desenleri
description: "Cursor ajanlarının iyi performans gösterdiği prompt desenleri — deneyle ölçüldü, ~25 dalga sonrası"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-02T14:33:48.684Z
---

Ajanlar her turda **sıfırdan başlar**. Aşağıdakiler ~25 dalgada deneyle ölçüldü.

## İskelet (her prompt'ta)

1. **Dal kuralı en başta, kalın.** FE ajanı iki kez yanlış yere yazdı; ilk satıra
   `⚠️ İlk komutun: git checkout -b …` konunca bir daha olmadı.
2. **Proje bağlamı kısa blok** — katmanlama, `core/` yasağı, `try/catch` yok, TÜRKÇE.
3. **"Neden bu iş"** — ürün gerekçesi. Kapsam kararlarını doğru yerden verdiriyor.
4. **Sözleşme tablosu** — uçlar, alanlar, yetkiler. Yoksa ajan uç uyduruyor.
5. **"Yapmayacakların"** listesi. Yazılmayan yasak ihlal ediliyor.
6. **Bitti tanımı** — komutlar + *"gerçek çıktıyı yapıştır, çalıştırmadığın komut
   için 'geçti' yazma — kontrol ediliyor."*
7. **"Raporunda"** — ne anlatmasını istediğin. Sorulmayan anlatılmıyor.

## Çok işe yarayanlar

- **Kolay-ama-yanlış yolu açıkça yasakla.** "Seed'de rolleri yükselterek sorunu
  gizleme", "`useAdminScope`'un `throw`'unu kaldırma", "export altyapısını yeniden
  yazma", "`--ignore-conflicts` ile sorunu gizleme". Yasaklanmayan kestirme seçiliyor.
- **Kararın GEREKÇESİNİ iste.** "Hangi çözümü neden seçtiysen yaz" dendiğinde ajan
  `items-start` gibi yamayı bırakıp master–detail düzenini seçip savundu.
- **Doğrudan soru sor.** *"Sayfa önden guard'la kapatılıyor mu, kontrol et ve
  raporunda yaz"* → `RequirePermission` ön guard'ı böyle bulundu. Sormasaydım
  raporda geçmeyecekti. **Şüphelendiğin şeyi soru olarak koy.**
- **Tarama iste.** "Aynı desen başka yerde var mı?" → sessiz-iptal taraması,
  yanlış-yetki taraması. Ajan tarar ve listeler; bu turda değiştirmesin.
- **Sözleşme alan adlarını iki prompt'a da sabitle** (`hasSupported`,
  `format: "xlsx"|"pdf"`, `committeeTally`). FE, henüz olmayan uca güvenle kodlar.
- **Riskli adıma kaçış bırak ama sessizliği yasakla.** "exceljs çalışmazsa CSV'ye
  düş ama SESSİZCE geçme, raporunda yaz." Yazdı.
- **Testte iki yolu da iste.** Bayrak eklerken "kapalı yol da test edilecek"
  denmezse yalnızca açık yol test ediliyor.
- **Migration'da snapshot uyarısı** — zincir bir kez bozuldu, prod deploy düştü.
  Artık her şema dalgasında yazıyorum: "zincirin en son snapshot'ından üret,
  `db:migrate` flagsiz exit 0 vermeli, kanıtla."

## Ajan davranışı — bilinmesi gerekenler

- **"Gerekebilir" = kesin arıza.** *"prod migrate aynı flag veya snapshot onarımı
  gerekebilir"* cümlesi, deploy'u düşüren kesin bir kırığı anlatıyordu. Ajanlar
  kötü haberi yumuşatıyor; hedge ifadeleri kesinlik olarak oku.
- **Tarayıcıda tıklayamazlar.** "Demo provası yap" dendiğinde API doğrulamasıyla
  ikame ediyorlar (dürüstçe söyleyerek). **Tıklama provası kullanıcıya ait iş.**
- **Kendi oturumlarında kapılar düşebilir** (Postgres tükenmesi). "Siz koşun"
  dediklerinde koş; genelde kod sağlam çıkıyor.
- **Aynı prompt iki ajana giderse çarpışırlar** ama kendini onarıyorlar — ikincisi
  birincinin kopya dosyalarını sildi. Yine de yanlış prompt dağıtımına dikkat.
- **Dürüst "bilerek eksik" bölümü altın değerinde.** N+1, boş kalan bölüm, eksik
  alan — hepsi oradan çıktı. Bu bölümü her prompt'ta iste.

## Prompt GENİŞLİĞİ — 2026-08-02'de ölçüldü

Aynı işi iki kez verdim, tek fark genişlikti:

- **Geniş:** "kişi detayına altı sekme ekle" → ajan çok uzun sürdü,
  kullanıcı yarıda kesti, çıktı yok.
- **Dar:** "kişi detayına YALNIZCA moderasyon sekmesi ekle, başka sekme
  ekleme, mevcut içeriği yeniden düzenleme" → temiz teslim, üç kapı yeşil.

**Kural: bir turda bir sekme, bir ekran, bir uç.** Kapsamı daraltmak
"yavaşlatmak" değil; geniş prompt teslim edilmiyor, dar prompt ediliyor.

Dar tutarken **neyi YAPMAYACAĞINI da yaz** — "başka sekme ekleme" cümlesi
olmasa ajan kendiliğinden genişletir.

## "Benim yazdığıma değil, gördüğüne göre kod yaz"

Bu cümleyi prompt'a koyduğumda ajan **beni iki kez düzeltti**:
- Tasarım dokümanımdaki üç izin adı kodda yoktu (`application.review`,
  `club.manage`, `university.view`) — gerçeklerini bulup kullandı.
- Prompt'a `platform.user.manage` yazmıştım, o izin yoktu; ucun
  `guardRole("super_admin")` ile korunduğunu gösterdi.

**Prompt'taki sözleşme tablosu yanılabilir; ajanın koda bakmasını iste.**

## İşe yaramayanlar

Uzun mimari anlatısı (okunmuyor) · "dikkatli ol" gibi soyut uyarılar ·
tek turda üç büyük iş · "yeni backend işi yok" demek (uç uydurmayı engellemiyor;
**"listede olmayan uca kod YAZMA, bildir"** diye yazmak gerekiyor) ·
**ajan sayısını artırmak** (bkz. [[iki-agent-paralel-model]] — darboğaz
doğrulama, ajan değil).

## Dalga eşleme

**Backend biter, arayüz bekler** deseni bu projede **yedi kez** tekrarladı. Mümkünse
dalgaları eşle: BE bir şeyi bitirirken FE önceki turun yüzeyini yapsın. Aksi hâlde
"özellik var ama kullanılamıyor" birikiyor.

İlgili: [[pm-rolu-ve-denetim-duzeni]] · [[dogrulama-refleksleri]] ·
[[onay-bekleme-yok]] · [[depo-dal-kurallari]]
