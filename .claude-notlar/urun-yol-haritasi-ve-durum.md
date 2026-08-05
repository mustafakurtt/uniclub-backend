---
name: urun-yol-haritasi-ve-durum
description: "Yol haritası docs/planning/product-roadmap.md; M1-M2-M2.5-M3-M3.5 bitti, M2.9 yönetim IA yarıda, 570 test"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-02T14:34:42.258Z
---

Ürünün tamamı **`docs/planning/product-roadmap.md`**: dokuz alan izi (T1–T9) +
iki yüzey izi (T10, FE), M1–M8 milestone'ları.

**Ürün:** Türkiye üniversitelerinin öğrenci kulübü ekosistemi için çok kiracılı
SaaS. Müşteri kurumun kendisi (SKS satın alır, öğrenci kullanır). **Pilot bölge
Antalya, ana okul Antalya Bilim.** Kullanıcı tek başına geliştiriyor.

## Durum (2026-08-02 akşamı)

**Bitti:** M1 (v1.7.0) · M2 (v1.8.0) · M2.5 (v1.9.0) · M3 (v2.1.0) ·
**M3.5 yüzey kapsaması + belge akışı** · M2.7 arayüz cilası.
**570 test.** 204 uç, hepsi izin anahtarıyla korunuyor (`guardRole` silindi).

**M2.9 yönetim bilgi mimarisi — YARIDA.** Dalga 1-2-4 bitti (menü nesneye
göre yeniden gruplandı, ana sayfa bağımsız iş kuyruğu blokları, etkinlik
ekranı). Dalga 3 **başladı** — kişi detayına moderasyon sekmesi eklendi;
`/admin/moderation` hâlâ duruyor, yetenek taşınmadı yalnızca ikinci yerde
açıldı. **Dalga 5 (detay sekmeleri) açık ve asıl iş orada:** bilgi menüden
detay sayfalarına taşınır, liste dar olur detay her şeyi barındırır.
Tasarım: `docs/design/07-yonetim-bilgi-mimarisi.md`.

**M2.8 öğrenci/personel ayrımı — teşhis kondu, ertelendi.** `domainType`
kapıda biliniyor ama saklanmıyor; `users.userType` gerekiyor.

## Refactor zinciri (2026-08-02) — üç adım, hepsi testsiz geçti

`auth.service` 1206→17 · `admin/` 1892→650 (çöp çekmecesi konularına
dağıtıldı) · `activities`+`clubs` 658+576→15+15. Üçünde de
`git diff --stat tests/` **boş** — testi değiştirmeden geçmesi refactor
olduğunun kanıtı. Katman kuralı (`db` yalnızca repository'de) artık
`tests/unit/layer-boundary.test.ts` ile CI'da zorlanıyor, istisna listesi yok.

**v2.0.0 içeriği:** kurul oylaması (`committee_majority`), genel kurul ve
organlar (asil/yedek, unvanlar), danışman kabul akışı, akademik dönem + üyelik
tarihçesi, kontrol listesi + itiraz, devir teslim, tutanak PDF'leri, modal→rota
bilgi mimarisi.

**Yeni izler (araştırmadan doğdu):** T1.6 topluluk organları/genel kurul ·
T3.6 risk kabul beyanı.

## Demo hedefi — çalışma yönünü belirliyor

Kullanıcı: *"önce gösterecek bir şey olmalı ki kurum ciddiye alıp bilgi versin."*
Bu doğru sıralama; ben önce "git konuş" demiştim, geri aldım.

Seed **Antalya Bilim'e sadık** kurulu: 8 kurucu eşiği, 5 üyeli Koordinasyon
Kurulu + `committee_majority` zinciri, Yazılım kulübü tam donanımlı (5 asil +
5 yedek yönetim, denetleme kurulu, genel kurul kaydı, kabul etmiş danışman).

**Demo hikâyesi:** kuruluş önerisi → destek toplama → Koordinasyon Kurulu
oylaması → danışman kabulü → genel kurul, kurul seçimi, tutanak PDF → etkinlik →
QR yoklama → resmî rapor.

**Yan fayda:** seed'i yönergeye sadık kurmak **tasarım boşluklarını görünür
kıldı**. Herkesi `university_admin` yapsaydık her şey çalışır görünür, gerçek
kurumda patlardı.

## M5 tartışması (kapandı)

Kullanıcı leaderboard/turnuvayı erken sordu, sonra *"karmaşıklık olmasın,
önceki rotadan devam"* dedi. Analiz: T3.2'nin teknik kilidi (akademik dönem)
açıldı ve puan kaynaklarının yarısı hazır; ama T3.1 turnuva üç yönergenin
hiçbirinde geçmiyor (ürün bahsi, kurumsal talep değil) ve T2.3 çapraz-tenant en
zor iş. **Dönülürse yalnızca T3.2, kulüp bazlı.**

## Kalan araştırma borcu

Etkinlik/sosyal transkript dayanağı · barındırma yeri yurt içi zorunluluğu ·
risk beyanının dijital kabulünün hukuki geçerliliği. Çoğu kapandı
(bkz. [[yonerge-arastirmasi]]).

## ⚠️ Prod YOK — her şey local

Kullanıcı 2026-08-02'de düzeltti: çalışan bir üretim ortamı yok, deploy
altyapısı denemeden kalma. **"Prod JWT_SECRET" iş maddesi geçersiz**, bir daha
gündeme getirme. Bkz. [[desktop-prod-access]].

## Staj bitiyor — 2026-08-03 Pazartesi

Kullanıcı projeyi **yazılım müdürüne** gösterecek (SKS'ye değil). İzleyici
değişince öncelik de değişti: **kod donduruldu**, yeni özellik yok. Yazılım
müdürü mimariye, mühendislik disiplinine ve karar gerekçelerine bakar —
güçlü olunan taraf tam orası (530 test, beş kapı, araştırmaya dayalı tasarım,
yeniden üretilebilir belgeler, çok kiracılı bayrak altyapısı).

## Staj sonrası düşünülen fikirler (kullanıcıdan)

Etkinliklerde **beğeni**, **istatistik/dashboard** yapıları, **yarışma ve anket**.
Değerlendirmem: istatistik (T6.1) en yüksek getirili — SKS'nin asıl acısı
raporlama ve Excel/PDF çıktıları zaten var, görsel katman doğal devam. Anket
(T3.4) ikinci — etkinlik sonrası geri bildirim üç yönergede de var. Beğeni
üçüncü (öğrenci benimsemesi, ama moderasyon yüzeyi açar). Turnuva (T3.1) son —
üç yönergenin hiçbirinde geçmiyor, ürün bahsi.

**How to apply:** Yeni özellik istendiğinde önce roadmap'teki izine yerleştir.
Araştırma bulgusu yol haritasına işlenmeden "not aldık" sayma.
İlgili: [[yonerge-arastirmasi]] · [[ajan-prompt-desenleri]] · [[onay-bekleme-yok]]
