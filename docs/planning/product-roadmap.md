# Ürün Yol Haritası — Kurumsal Kulüp Yönetimi Platformu

**Durum:** Taslak, tartışmaya açık (2026-08-01)
**Kapsam:** Tüm ürün — backend, tüketici yüzeyleri, kurumsal süreçler, entegrasyon.
**İlgili:** [planning/README.md](README.md) (teknik sıra) · [schema-product.md](schema-product.md) · [security-core.md](security-core.md)

Bu doküman **niyet ve sıra** taşır; ilerleme takibi tutmaz. İlerleme CHANGELOG ve
commit geçmişinde. Kararlar netleştikçe ilgili maddeler ADR'ye taşınır.

---

## 0. Ürün tanımı ve varsayımlar

Türkiye'deki yükseköğretim kurumlarının **öğrenci kulübü ekosistemini** uçtan uca
yöneten çok kiracılı (multi-tenant) bir SaaS. Tek kurulum çok üniversiteye hizmet
eder; tenant sınırı `universityId`.

**Kullanıcı sınıfları:**

| Sınıf | Kim | Ana ihtiyaç |
| --- | --- | --- |
| Öğrenci | Kulüp üyesi/aday | Keşif, katılım, aidiyet, belge |
| Kulüp yönetimi | Başkan, yönetim kurulu | Etkinlik/duyuru yayını, üye yönetimi |
| Danışman | Akademik personel | Gözetim, onay, sorumluluk |
| Kurum yönetimi (SKS) | Sağlık Kültür Spor birimi | Başvuru denetimi, izin, raporlama, uyum |
| Platform operatörü | SaaS sağlayıcı | Tenant yaşam döngüsü, destek |

**Kritik bağlam:** Bu bir tüketici uygulaması değil; **kamu kurumu iş akışı**.
Kararlar denetlenebilir, belgeler resmî kayda uygun, veri işleme mevzuata uygun
olmak zorunda. "Hataya yer yok" ifadesi mühendislik açısından şu demek: her
onay zinciri iz bırakır, her resmî çıktı yeniden üretilebilir, hiçbir yıkıcı
işlem tek kişinin tek tıkıyla gerçekleşmez.

**Açık stratejik sorular** (§9'da ayrıntılı) — cevaplar sıralamayı değiştirir.

---

## 1. İzler (alt dallar)

Roadmap dokuz **iz** (track) ve bir **yüzey** izinden oluşur. İzler paralel yaşar;
milestone'lar (§8) izlerden dilim alarak ilerler.

```
T1  Kulüp yaşam döngüsü          T6  Veri ve analitik
T2  Etkinlik & duyuru yayıncılığı T7  Bildirim ve iletişim altyapısı
T3  Katılım, rekabet, ölçüm       T8  Platform / SaaS operasyonu
T4  Kurumsal yönetim (SKS)        T9  Teknik temel
T5  Entegrasyon ve uyum           T10 Kamuya açık yüzey (QR, tanıtım)
                                  FE  Tüketici yüzeyleri
```

---

## T1 — Kulüp yaşam döngüsü

Kulübün doğuşundan kapanışına kadar tüm hâlleri.

### T1.1 Kuruluş: imza yerine dijital destek toplama ★

Bugün gerçek hayatta bir kulüp kurmak için ıslak imza toplanır — yavaş, kayıp
riski yüksek, denetlenemez. Yerine:

- Öğrenci bir **kuruluş önerisi** açar (ad, amaç, taslak tüzük, danışman adayı).
- Öneri **destek toplama** aşamasına girer: diğer öğrenciler dijital olarak destekler.
- Kurum tarafından belirlenen **eşik** aşılınca (bkz. `tenant_settings`) öneri
  otomatik olarak SKS kuyruğuna düşer.
- SKS inceler; onaylarsa kulüp `pending` yerine gerçek kulüp olarak doğar.

**Karar gerektiren:** Destek geri çekilebilir mi? Eşik sayı mı yüzde mi? Destekleyen
kimliği kulüp yönetimine görünür mü (KVKK)? Süre sınırı var mı?

Bugünkü `clubApplications` bu akışın basitleştirilmiş hâli; genişletilecek.

### T1.2 Danışman ve onay zinciri

- Danışman ataması bugün var; **kabul/ret** akışı yok (akademisyen zorla atanamaz).
- Danışman değişikliği, geçici vekâlet, danışmansız kalma durumu.
- Danışmanın sorumluluk kapsamı: hangi işlemler danışman onayı ister?

### T1.3 Dönemsel devir teslim

Akademik dönem yapısına bağlı (T9 → D1). Kulüp yönetimi her dönem/yıl değişir:

- Seçim veya atama kaydı, görev süresi
- Devir teslim tutanağı (resmî çıktı — T4.5)
- Devredilen envanter, devam eden etkinlikler, bekleyen başvurular

### T1.4 Kapanma, askıya alma, arşiv

- Faaliyetsizlik tespiti (T6 kulüp sağlık skoru)
- SKS tarafından askıya alma (gerekçeli, itiraz hakkı)
- Arşivleme ve verinin ne kadar süre saklanacağı (T5 uyum)

### T1.5 Üyelik derinleşmesi

- Aidat takibi (opsiyonel, kuruma göre)
- Üyelik türleri (aktif/pasif/onursal)
- Üyelikten çıkarma ve itiraz

---

## T2 — Etkinlik ve duyuru yayıncılığı

Bugün temel var: duyuru yaşam döngüsü (`draft`/`published`, `pinned`,
`visibility`), etkinlik (`draft`/`published`/`cancelled`, RSVP, co-host,
kapasite/bekleme listesi), okul geneli duyuru.

### T2.1 Zamanlanmış yayın ★ — **tamamlandı**

Tenant `timezone` (C2) üzerinden duvar saat → UTC; BullMQ **geçikmeli iş** (`jobId`
idempotency, reschedule'da eski iş kaldırılır). Duyuru ve etkinlik taslakları.

- `scheduledPublishAtLocal` istek alanı (`YYYY-MM-DDTHH:mm`, offset yok)
- Geçmişe dönük zaman **400**; iptal (`null`) ve tarih değişimi
- Yayın anında `published` + `publishedAt` + bildirim fan-out (`firstPublish` korunur)
- Zamanlanmış taslak feed/keşif listesinde görünmez

### T2.2 Çoklu ve tekrarlayan etkinlik ★

- Seri etkinlik (her hafta salı, 8 hafta) — tek tanım, çok örnek
- Örneklerden birini ayrı düzenleme/iptal etme
- Çok oturumlu etkinlik (aynı etkinliğin 3 seansı, tek RSVP)

### T2.3 Kurumlar arası ortak yapılar ★

Etkinlikte çok-üniversiteli co-host **bugün çalışıyor** (deliberate design;
`activity_clubs` M:N + `assertCanRsvp` tenant kuralı). Genişletme:

- Ortak **duyuru** (bugün yok — duyuru tek tenant'a bağlı)
- Ortak **yarışma/turnuva** (T3.1)
- Kurumlar arası davet ve kabul akışı, sorumluluk paylaşımı
- Katılımcı verisinin kurumlar arasında ne kadar paylaşılacağı (KVKK — T5.4)

### T2.4 Mekân/salon rezervasyonu ve çakışma

Gerçek üniversite operasyonunda etkinliğin en sık tıkandığı yer. Ürün buna
girmezse kurum yine Excel'e döner.

- Mekân envanteri (kapasite, donanım, sorumlu birim)
- Rezervasyon talebi → onay → çakışma kontrolü
- Etkinlik iptalinde rezervasyonun serbest bırakılması

**Karar:** Mekân yönetimi bu üründe mi, yoksa kurumun mevcut sistemine
entegrasyon mu? (§9)

### T2.5 Etkinlik izin süreci

Türkiye'de dış konuşmacılı, kampüs dışı veya basına açık etkinlikler ek izin
ister (güvenlik, dekanlık/rektörlük).

- Etkinlik türüne göre farklı onay zinciri
- Ek belge yükleme (konuşmacı özgeçmişi, afiş)
- Onay çıkmadan yayınlanamama kilidi

### T2.6 Paylaşım ekranı ve önizleme ★

Kullanıcı isteği: "detaylı bir paylaşım ekranı".

- Kanal seçimi: uygulama içi, e-posta, push, kurum sitesi, sosyal medya kartı
- Önizleme (her kanalda nasıl görünecek)
- Hedef kitle seçimi (kulüp üyeleri / bölüm / sınıf / tüm kurum)
- Afiş/görsel yükleme ve otomatik boyutlandırma
- Paylaşım sonrası performans (T6.2)

### T2.7 İçerik moderasyonu

Kurumsal ses söz konusu olduğu için: yayın öncesi kontrol (kuruma göre
zorunlu/opsiyonel), uygunsuz içerik bildirimi, geri çekme ve düzeltme kaydı.

---

## T3 — Katılım, rekabet, ölçüm

### T3.1 Yarışma ve turnuva ★

Şema yorumunda zaten öngörülmüş (`activity_attendees` "leaderboard burada
tutulmaz; kendi tablolarını alır").

**Üç yarışma seviyesi — hepsi desteklenmeli:**

| Seviye | Katılımcı | Örnek |
| --- | --- | --- |
| **Kulüp içi** | Aynı kulübün üyeleri/takımları | Yazılım kulübünün kendi içinde hackathon |
| **Kulüpler arası** (kurum içi) | Aynı üniversitenin kulüpleri | Kulüpler arası futbol ligi |
| **Kurumlar arası** | Farklı üniversitelerin kulüpleri | Üniversitelerarası münazara turnuvası |

Katılımcı birimi seviyeye göre değişir: **birey**, **takım** (kulüp içi
oluşturulan), veya **kulüp** (kulübün kendisi yarışmacı). Şema bunu tek bir
"yarışmacı" soyutlamasıyla karşılamalı; üç ayrı tablo değil.

- Turnuva formatları (lig, tek/çift eleme, puan tablosu, grup + eleme)
- **Takımlaşma:** kulüp içinde takım kurma, kaptan, takım üyeliği
- Fikstür üretimi, maç/tur sonuçları, itiraz süreci
- Kurumlar arası turnuvada ev sahipliği ve sorumluluk (T2.3 ile birlikte)

### T3.2 Leaderboard ve puanlama ★

- Kulüp bazlı, kurum bazlı, kurumlar arası sıralama
- Puan kaynakları: katılım, düzenleme, gönüllülük saati, yarışma derecesi
- Sezon/dönem sıfırlama (T9 → D1)
- Manipülasyona karşı denetim izi

### T3.3 Gönüllülük saati ve etkinlik transkripti ★

Kullanıcının "transkript" ile kastettiği yapı. Öğrencinin kulüp/etkinlik
geçmişinin **resmî belgeye** dönüşmesi:

- Doğrulanmış katılım (QR yoklama — `checkedInAt` altyapısı var)
- Gönüllülük saati birikimi
- Dönem sonu **etkinlik/sosyal transkript** çıktısı (PDF, kurum mühürlü)
- Belgenin doğrulanabilirliği (QR/kod ile teyit ucu)

**Doğrulanacak:** Kurumların bunu hangi formatta ve hangi mevzuata dayanarak
verdiği (§9).

### T3.4 Anket ve oylama

Kuruluş anketinden (T1.1) ayrı, genel amaçlı:

- Kulüp içi oylama (yönetim seçimi, karar alma)
- Kurum geneli anket (SKS'nin öğrenciye sorması)
- Anonim/açık oylama seçimi, sonuç şeffaflığı

### T3.5 Katılım belgesi ve rozet

- Etkinlik sonrası otomatik katılım belgesi
- Rozet/başarım sistemi (oyunlaştırma — dozunda)

---

## T4 — Kurumsal yönetim (SKS)

Kullanıcının "tam hakimiyet" istediği alan. Buradaki eksik, ürünün kurumda
kullanılmamasına yol açar — kurum Excel'e geri döner.

### T4.1 Başvuru inceleme derinleşmesi ★

Bugün başvuru onay/ret ikilisi. Gerçek süreç çok adımlı:

- Kontrol listesi (evrak tam mı, tüzük uygun mu, danışman onayı var mı)
- **Revizyon isteme** (ret değil, düzeltme talebi) ve tekrar gönderim
- Gerekçeli ret, itiraz hakkı ve itiraz incelemesi
- Ön inceleme (uzman) → karar (yönetici) ayrımı
- Başvuru geçmişinin tam izi

### T4.2 Onay hiyerarşisi ve delegasyon

- Çok kademeli onay (danışman → SKS uzmanı → SKS müdürü → dekanlık)
- Kademe sayısı ve sırası **tenant ayarı** (kurumdan kuruma değişir)
- Vekâlet/devir (izindeki yöneticinin yetkisi)
- Süre aşımı davranışı (otomatik yükseltme veya hatırlatma)

### T4.3 Toplu işlemler

Kurum yöneticisi tek tek tıklayamaz: toplu onay, toplu bildirim, toplu dışa
aktarım, toplu dönem geçişi.

### T4.4 Denetim ve teftiş görünümü

- Zaman aralığı bazlı kurum faaliyet özeti
- Hangi kararı kim ne zaman verdi (audit zaten var, sunum katmanı yok)
- Değişmez kayıt garantisi (append-only)

### T4.5 Resmî çıktılar: Excel / PDF ★

Kullanıcı isteği. Türkiye'de kurumsal iş akışının belkemiği.

- Kulüp listesi, üye listesi, etkinlik takvimi, faaliyet raporu
- **Yıllık faaliyet raporu** (kurumun üst yönetime sunduğu belge)
- Devir teslim tutanağı, karar tutanağı
- Çıktılar **yeniden üretilebilir** olmalı: aynı parametrelerle aynı belge
- Şablonların tenant bazlı özelleştirilmesi (kurum logosu, imza blokları)

### T4.6 Bütçe ve harcama

- Kulübün bütçe talebi, SKS'nin tahsisi
- Harcama belgesi yükleme ve onay
- Dönem sonu mahsuplaşma
- **Karar:** Muhasebe entegrasyonu mu, yalnızca takip mi? (§9)

### T4.7 Envanter/demirbaş

Kulübe zimmetli malzeme, devir teslimde envanter kontrolü.

### T4.8 Sponsorluk

Üniversite etkinliklerinde yaygın ama **süreci netleştirilmeli** — bugün nasıl
işlediği bilinmiyor, araştırılacak (§9).

Muhtemel iki seviye:

- **Kurum düzeyi:** üniversitenin genel sponsorluk anlaşmaları, tüm kulüplere
  yansıyan haklar
- **Kulüp/etkinlik düzeyi:** tek bir etkinliğin veya kulübün sponsoru

Ürün tarafında karşılığı olabilecekler: sponsor kaydı ve logo/görünürlük
(kulüp tanıtım sayfası ve etkinlik sayfasında — T10), sponsorluk teklifi ve
kurum onayı akışı (T4.2 onay hiyerarşisine bağlanır), sözleşme/belge saklama,
sponsora raporlama (kaç kişi gördü/katıldı — T6.2).

**Araştırılacak:** Kurumun izin süreci nedir, sponsorluk geliri kime yazılır,
kulüp doğrudan sponsor bulabilir mi yoksa SKS üzerinden mi gider?

---

## T5 — Entegrasyon ve uyum

SaaS olmanın en zor kısmı: her kurumun kendi sistemleri ve mevzuat yorumu var.

### T5.1 Öğrenci Bilgi Sistemi (OBS) entegrasyonu ★

Bugün kimlik e-posta domaininden çıkarılıyor; öğrencilik durumu doğrulanmıyor.
Gerçek kurumda gerekli: aktif öğrenci mi, hangi bölüm, kaçıncı sınıf, disiplin
durumu.

Her kurum farklı OBS kullanıyor → **adaptör mimarisi** şart:

- Tenant başına entegrasyon sağlayıcısı seçimi
- Ortak iç model + sağlayıcıya özel adaptör
- **Fallback: manuel içe aktarım** (Excel/CSV) — entegrasyon yoksa da ürün çalışsın
- Senkronizasyon sıklığı, çakışma çözümü, silinen öğrenci davranışı

### T5.2 Kimlik ve oturum açma

- Kurum SSO (SAML 2.0 / OIDC) — üniversitelerde yaygın
- Tenant başına farklı kimlik sağlayıcı
- Mevcut e-posta/şifre akışıyla birlikte yaşama

### T5.3 Resmî yazışma ve imza

- e-imza / mobil imza ile karar imzalama
- KEP (Kayıtlı Elektronik Posta) ile resmî bildirim
- EBYS (Elektronik Belge Yönetim Sistemi) entegrasyonu

**Araştırılmalı:** Hangisi zorunlu, hangisi tercihe bağlı; kurumdan kuruma
değişiyor olabilir (§9).

### T5.4 KVKK ve veri yönetişimi

Kısmen var (`docs/compliance/kvkk.md`, anonimleştirme, audit). Eksikler:

- **Veri sorumlusu / veri işleyen ayrımı** — SaaS'ta kritik: kurum sorumlu,
  platform işleyen. Sözleşme ve teknik önlemler buna göre.
- Aydınlatma metni ve açık rıza yönetimi (tenant bazlı metin)
- Saklama süreleri ve otomatik imha
- Veri sahibi başvuruları (erişim, düzeltme, silme) için operasyonel akış
- Yurt dışına veri aktarımı (barındırma yeri kararı)
- Veri ihlali bildirim süreci

### T5.5 Erişilebilirlik

Kamu kurumu yüzeyi olduğu için ciddiye alınmalı: WCAG uyumu, klavye
navigasyonu, ekran okuyucu. Frontend izinde (FE) gereksinim olarak taşınır.

---

## T6 — Veri ve analitik

### T6.1 Kurum paneli metrikleri ★

- Kulüp sayısı, aktiflik dağılımı, üye sayıları, büyüme
- Etkinlik sayısı/katılım oranları, kategori dağılımı
- Bölüm/sınıf bazlı katılım (kim katılmıyor?)
- Dönemsel karşılaştırma

### T6.2 İçerik ve etkinlik performansı

Kullanıcı isteği (paylaşım sonrası ölçüm):

- Duyuru erişimi, okunma, tıklama
- Etkinlik: görüntülenme → RSVP → gerçek katılım hunisi
- Kanal bazlı etkinlik (hangi bildirim kanalı işe yarıyor)

### T6.3 Kullanıcı 360 görünümü ★

Kullanıcı isteği: "kullanıcının yaptığı etkileşimleri tek pencerede".

- Üyelikler, başvurular, RSVP'ler, katılımlar, gönüllülük saati
- Moderasyon geçmişi, bildirim geçmişi
- **KVKK kısıtı:** bu güçlü bir gözetim ekranı; kimin görebileceği ve
  loglanması dikkatle tasarlanmalı.

### T6.4 Kulüp sağlık skoru

Faaliyetsizlik erken uyarısı — SKS'nin proaktif müdahalesi için.

### T6.5 Raporlama motoru

- Zamanlanmış rapor (haftalık/aylık e-posta)
- Parametreli rapor tanımları, dışa aktarım (T4.5 ile ortak altyapı)

### T6.6 Platform (SaaS) analitiği

Operatör tarafı: tenant kullanım metrikleri, sağlık, kota tüketimi
(eski roadmap "F — platform dashboard").

---

## T7 — Bildirim ve iletişim altyapısı

Bugün güçlü bir temel var: kalıcı bildirim, WebSocket, Web Push, tip/kulüp
bazlı susturma, toplu fan-out + kuyruk eşiği, okul geneli yayın.

### T7.1 E-posta kanalı olgunlaşması ★

Bugün e-posta yalnızca doğrulama/davet/şifre sıfırlama için. Bildirim kanalı
olarak yok.

- Bildirim tiplerinin e-posta karşılığı
- Özet e-posta (günlük/haftalık digest) — spam yerine toplu
- Şablon yönetimi, tenant bazlı marka (T9 → C2 branding)
- Teslimat raporu, bounce/şikayet yönetimi, gönderim itibarı

### T7.2 Kanal tercihleri derinleşmesi

Bugün "bu bildirimi istiyor muyum". Eksik: "hangi kanaldan". Şema bunu
büyütecek şekilde tasarlandı (kanal kolonu eklenebilir).

### T7.3 Acil/kurumsal duyuru

Susturulamaz, tüm kanallardan giden kurum duyurusu (kampüs güvenliği vb.).
Kötüye kullanıma karşı sıkı yetki + audit.

### T7.4 SMS

Maliyetli; kuruma göre opsiyonel. Kota ve fatura (T8) ile ilişkili.

### T7.5 Şablon ve çok dillilik

i18n altyapısı var (tr/en). Bildirim ve belge şablonlarının çok dilli ve tenant
özelleştirmeli hâle gelmesi.

---

## T8 — Platform / SaaS operasyonu

Bugün hazır: tenant yaşam döngüsü ve durumu, atomik onboard, token'lı yönetici
daveti, platform hesapları, tenant ayarları, çapraz-tenant read-model'ler.

### T8.1 Plan, abonelik, kota

`plans`, `subscriptions`, kullanım sayaçları. Kotalar `tenant_settings`
altyapısına bağlanır (ayar tavanı = plan).

### T8.2 Destek konsolu

Çapraz-tenant arama, destek görünümü, **impersonation** (güvenlik incelemesi
sonrası — riskli, tam audit şart).

### T8.3 Self-servis onboarding

Kurumun kendi kendine deneme başlatması; bugün operatör açıyor.

### T8.4 Operasyonel gözlemlenebilirlik

Sağlık, kuyruk durumu, hata oranları, tenant bazlı ayrıştırma.

---

## T9 — Teknik temel

Mevcut teknik roadmap ([planning/README.md](README.md)) bu izin içinde yaşar.

| Madde | Durum | Not |
| --- | --- | --- |
| C2 tenant profili (timezone, locale, branding) | Tamamlandı | T2.1 önkoşulu karşılandı |
| D1–D2 akademik dönem + üyelik tarihçesi | Sırada | **T1.3 devir teslim ve T3.2 sezon sıfırlamanın önkoşulu** |
| E medya varlıkları | Planlı | T2.6 afiş/görsel için gerekli |
| G OpenAPI | Planlı | FE izinin sözleşmesi; yüzey stabilleşince |
| security-core Tier 2 | Paralel | ALS/requestId, idempotency, kuyruk soyutlama, nesne seviyesi yetkilendirme (IDOR), refresh rotation, secret rotation |
| hono-core çıkarımı | Paralel | Ayrı kütüphane hedefi |
| Ölçek | Sürekli | Sayfalama tamamlama, N+1 taraması, yük testi |

**Kurumsal güvence (kesişen gereksinim):** Her onay zinciri iz bırakır; resmî
çıktılar yeniden üretilebilir; yıkıcı işlemler tek tıkla gerçekleşmez; kritik
kararlarda çift onay; kayıtlar append-only.

---

## T10 — Kamuya açık yüzey (QR, tanıtım)

**Yeni mimari eksen.** Bugün sistemde neredeyse her şey kimlik doğrulama
arkasında (istisna: `GET /api/universities`, `/uploads/:key`). Afişteki QR'ı
okuyan kişinin hesabı yoktur; tanıtım günlerindeki aday öğrenci henüz
üniversiteye kayıtlı bile değildir. Bu iz o yüzeyi açar.

### T10.1 QR kod sistemi ★

Üç farklı QR ihtiyacı var; **aynı şey değiller**, karıştırılmamalı:

| Tür | Ömür | Nerede | Amaç |
| --- | --- | --- | --- |
| **Afiş/tanıtım QR** | Süresiz veya bitiş tarihli | Basılı afiş, pano, broşür | Etkinlik/kulüp sayfasına götür |
| **Yoklama QR** | Çok kısa, dönen (rotating) | Etkinlik girişinde ekranda | Katılım doğrula — paylaşılamasın |
| **Belge doğrulama QR** | Süresiz | Sertifika, transkript üzerinde | Belgenin sahiciliğini teyit et |

Afiş QR'ının ayırt edici özellikleri:

- **Süreli / süresiz / tarih aralıklı** seçimi
- **Kaynak etiketi ("belirleyici"):** aynı etkinlik için farklı QR'lar —
  "A blok panosu", "kantin", "Instagram". Hangi afişin işe yaradığı ölçülür
  (T6.2 kanal performansı). Bu, basılı materyalin geri dönüşünü ölçmenin tek yolu.
- Yeniden yönlendirme: QR sabit kalır, hedefi sonradan değiştirilebilir
  (afiş basıldıktan sonra etkinlik saati değişirse afiş çöp olmasın)
- İptal/pasifleştirme
- Tarama sayacı ve zaman dağılımı

Yoklama QR'ı bugünkü `checkedInAt` alanının üstüne oturur; dönen kod olmazsa
öğrenciler QR'ı birbirine gönderir ve yoklama anlamsızlaşır.

### T10.2 Kulüp tanıtım sayfası ★

Her kulübün kamuya açık, paylaşılabilir sayfası:

- Kulüp kimliği: logo, kapak, tanıtım metni, sosyal medya
- Yaklaşan etkinlikler, geçmiş etkinlik vitrini, galeri
- "Katıl" çağrısı → giriş/kayıt akışına yönlendirme
- Sponsor görünürlüğü (T4.8)
- Paylaşım kartları (link paylaşıldığında düzgün önizleme)
- Kulübün kendi içeriğini düzenleyebilmesi (basit sayfa editörü)

**Karar:** Sayfa varsayılan olarak herkese açık mı, kurum onayıyla mı açılıyor?
Kurumsal ses söz konusu olduğu için moderasyon gerekebilir (T2.7).

### T10.3 Kamuya açık etkinlik sayfası

- Etkinlik detayı, tarih, yer, harita
- Takvime ekle (.ics)
- Kayıtsız kullanıcı için "ilgileniyorum" (yalnızca e-posta) — hesap zorunlu olmasın
- Etkinliğin görünürlük ayarına saygı: `members` etkinlik kamuya çıkmaz

### T10.4 Tanıtım günleri ve aday öğrenci ★

Kullanıcının somut senaryosu. **İki ayrı kitle, iki ayrı yol:**

| Kitle | Yol |
| --- | --- |
| Kayıtlı öğrenci/personel | **Okul geneli duyuru** — bu zaten çalışıyor (`/api/universities/:id/announcements`) |
| Aday öğrenci, veli, dış katılımcı | **Kamuya açık etkinlik sayfası + afiş QR** (T10.1, T10.3) |

Yani "sisteme kayıt olunca herkese düşen duyuru" iç kitle için doğru cevap ve
altyapısı hazır; dış kitle için hesap gerektirmeyen yüzey gerekiyor.

- Aday öğrenci ilgi kaydı (e-posta) ve sonrasında bilgilendirme izni (KVKK açık rıza)
- Tanıtım günü programı (çok oturumlu etkinlik — T2.2)

### T10.5 Kamuya açık yüzeyin güvenlik ve uyum yükü

Bu yüzey açıldığında ortaya çıkan, kolayca atlanan gereksinimler:

- **Kimlik gerektirmeyen uçlarda hız sınırı ve bot koruması** (mevcut limiter
  kimliğe göre çalışıyor; burada IP/challenge gerekiyor)
- **Önbellekleme ve CDN** — kamuya açık sayfa trafiği kimlik doğrulamalı
  trafikten farklı ölçeklenir
- **KVKK:** kamuya açık sayfada hangi kişisel veri görünür? Kulüp başkanının
  adı görünsün mü, öğrenci listesi kesinlikle görünmemeli
- **Tenant izolasyonu:** kamuya açık yüzeyde de tenant sınırı korunmalı
- Arama motoru görünürlüğü ve kurumun bunu kontrol edebilmesi

---

## FE — Tüketici yüzeyleri

### Mevcut durum (2026-08-01 tespiti)

Ayrı repo: `uniclub-frontend` (backend'in bir dizin üstünde, yan yana).
**React 19 + Vite + TypeScript + Tailwind 3 + React Router 7 + TanStack Query +
react-hook-form + zod + axios.** Backend'le aynı konvansiyonlar: feature
klasörleri, Türkçe yorumlar, kendi `CLAUDE.md` ve `docs/`'u, aynı pull-based
deploy deseni.

**Ölçek:** 116 dosya / ~11.650 satır — backend'in yarısı kadar. "Biraz var"
değil, ciddi bir temel.

| Alan | Durum |
| --- | --- |
| Auth (kayıt, giriş, e-posta doğrulama) | ✅ |
| Kulüpler (liste, detay, duyuru/galeri tipleri) | ✅ |
| Üniversiteler | ✅ |
| Admin paneli (kullanıcı, kulüp, başvuru, danışman, moderasyon, RBAC) | ✅ |
| Bildirimler (WebSocket bağlı) | ✅ |
| Dashboard | ✅ |
| **Etkinlikler (activities)** | ❌ **hiç yok** |
| Medya yükleme, galeri ekranı, audit | ❌ |
| Platform (SaaS operatör) paneli | ❌ |
| Bugün eklenen backend işleri (davet, şifre sıfırlama, bildirim tercihleri, okul geneli duyuru, tenant ayarları) | ❌ |

**Kabaca:** Frontend, backend'in ~3 hafta önceki hâline karşılık geliyor —
eksi etkinlikler.

**Sürüm hijyeni notu:** Frontend `feat/content-moderation` dalında, `main`'e
birleştirilmemiş; ayrıca `feat/audit-log-error-contract` dalı da açık. Backend'de
bugün yaşadığımız "biriken yayınlanmamış iş" sorunu burada da var.

### En büyük boşluk: etkinlikler

Backend'de etkinlik özelliği tam (yaşam döngüsü, RSVP, kapasite/bekleme listesi,
co-host, çok üniversiteli, yoklama alanı) ama **tek bir ekranı yok**. M1'in
hikâyesi etkinlik üzerinden aktığı için frontend işinin ağırlığı burada.

### Hedef yüzeyler

| Yüzey | Kapsam |
| --- | --- |
| **FE-0 Kamuya açık** | Kulüp tanıtım sayfası, etkinlik sayfası, QR giriş noktası (T10) — **hesap gerektirmez** |
| FE-1 Öğrenci web | Keşif, kulüp sayfası, etkinlik, RSVP, bildirim, profil |
| FE-2 Kulüp yönetim paneli | Üye/başvuru yönetimi, etkinlik ve duyuru yayını (T2.6 paylaşım ekranı), kulüp tanıtım sayfası editörü |
| FE-3 Kurum paneli (SKS) | Başvuru inceleme, onay zinciri, raporlar, dışa aktarım |
| FE-4 Platform operatör paneli | Tenant yaşam döngüsü, destek |
| Mobil | Sonraki aşama; web önce |

**Gerçeklik notu:** Frontend'i tek kişi yazacak (takım yok) ve aynı kişi
backend'i de sürdürüyor. Bu, milestone büyüklüklerinin küçük tutulmasını
zorunlu kılar. Her milestone **gösterilebilir bir hikâye** üretmeli; "önce tüm
API'ler, sonra tüm ekranlar" yaklaşımı bu kapasitede tıkanır.

---

## 8. Rota: milestone'lar

Milestone'lar izlerden dilim alır. Her biri **çalışır ve gösterilebilir** bir
bütün üretir.

### M1 — Pilot demosu ★ (öncelik)

**Amaç:** Antalya Bilim Üniversitesi'ne gösterilebilecek, ikna edici bir dilim.
Genel bir "frontend başlangıcı" değil — **belirli bir hikâyeyi** uçtan uca
çalıştırmak.

**Hikâye:** *Kulüp bir tanıtım etkinliği oluşturur → afişe QR basar → aday
öğrenci QR'ı okuyup kayıtsız etkinlik sayfasını görür → kayıtlı öğrenciye
duyuru düşer → etkinlik günü QR ile yoklama alınır → SKS kaç kişi katıldığını
görür.*

Bu hikâye T2, T3, T6, T10 ve FE'den birer dilim alır ve kurumun gerçekten
gördüğü acıyı (dağınık takip) tek ekranda çözer.

- **FE-1 → etkinlik ekranları** — en büyük boşluk; keşif, detay, RSVP.
  (Kulüp, auth, bildirim ekranları **zaten var**, sıfırdan yazılmayacak.)
- **FE-2** kulüp yönetiminde etkinlik/duyuru yayını + paylaşım ekranı
- **FE-0** kamuya açık etkinlik ve kulüp sayfası (hesapsız)
- T10.1 **QR sistemi** (afiş QR + yoklama QR)
- T10.2 kulüp tanıtım sayfası, T10.3 kamuya açık etkinlik sayfası
- T9 → **C2** (timezone/locale/branding) — zamanlanmış yayının önkoşulu
- T2.1 **zamanlanmış yayın**, T2.6 paylaşım ekranı (sade hâli)
- T9 → **G OpenAPI** (kendi frontend'imizin sözleşmesi)
- T6.2'nin minimum hâli: QR kaynak bazlı tarama sayısı

**Kapsam dışı bırakılanlar** (M1'i şişirmemek için): onay hiyerarşisi, resmî
çıktılar, turnuva, transkript, analitik derinliği.

### M2 — Kurumsal süreç

**Amaç:** Kurumun ürünü gerçekten benimsemesi.

- T4.1 başvuru inceleme derinleşmesi, T4.2 onay hiyerarşisi
- T1.1 **kuruluş anketi/destek toplama**
- T4.5 **Excel/PDF resmî çıktılar**
- **FE-3** kurum paneli ilk dilimi

### M3 — Dönem ve tarihçe

- T9 → **D1/D2** akademik dönem + tam üyelik tarihçesi
- T1.2 danışman onay zinciri, T1.3 **devir teslim**
- T4.4 denetim görünümü

### M4 — Katılım ve tanınırlık

- T3.3 **gönüllülük saati + etkinlik transkripti**
- T3.5 katılım belgesi
- T2.2 çoklu/tekrarlayan etkinlik, T2.4 mekân rezervasyonu

### M5 — Rekabet ve topluluk

- T3.1 yarışma/turnuva, T3.2 **leaderboard**
- T2.3 kurumlar arası ortak yapılar (duyuru + yarışma)
- T3.4 anket/oylama

### M6 — Görüş ve ölçüm

- T6.1–T6.4 analitik, **kullanıcı 360**
- T6.5 raporlama motoru
- T7.1 **e-posta kanalı** olgunlaşması

### M7 — Entegrasyon ve uyum

- T5.1 **OBS entegrasyonu** (adaptör + manuel içe aktarım)
- T5.2 kurum SSO
- T5.4 KVKK derinleşmesi

### M8 — Ticarileşme

- T8.1 plan/abonelik/kota
- T8.2 destek konsolu, T8.3 self-servis onboarding

**Not:** T7 (bildirim) ve T9 (teknik temel) her milestone'a dağılır; ayrı
milestone değildir.

---

## 9. Stratejik sorular

### Cevaplananlar (2026-08-01)

| Soru | Cevap | Sonucu |
| --- | --- | --- |
| **Müşteri kim?** | **Üniversiteler.** Kurumun kulüp/öğrenci yönetimini kolaylaştırmak + öğrencilerin sosyalleşeceği ortak bir yapı kurmak. Bugün her şey dağınık, herkes ayrı ayrı takip ediyor. | Öncelik kurum acısını çözmekte (T4), ama benimseme öğrenciden geçiyor (T10/FE) |
| **Pilot kurum?** | Henüz yok. Muhtemel: **Antalya Bilim Üniversitesi** (staj bağlantısı, projeyi beğenirlerse). | M1 bu kuruma gösterilecek demo olarak şekillendi |
| **Frontend kim yazacak?** | **Tek kişi** — hem backend hem frontend, takım yok. Frontend'in bir kısmı mevcut. | Milestone'lar küçük tutulacak; her biri gösterilebilir bir hikâye üretecek |
| **Transkript dayanağı?** | Bilinmiyor. | T3.3'e girmeden önce bakanlık/kurum dokümanları araştırılacak (aşağıda) |

### Açık kalanlar

1. **Mekân/rezervasyon bizde mi?** Kurumun mevcut sistemi varsa entegrasyon,
   yoksa ürün içi modül — çok farklı iş yükleri. *(Pilot kurumda sorulacak.)*
2. **Resmî belge zorunluluğu ne düzeyde?** e-imza/KEP/EBYS gerçekten gerekli mi,
   yoksa PDF çıktı yeterli mi?
3. **Etkinlik/sosyal transkript** hangi formatta, hangi dayanakla veriliyor?
4. **Sponsorluk süreci** nasıl işliyor? İzin kimden alınıyor, gelir kime
   yazılıyor, kulüp doğrudan sponsor bulabiliyor mu? (T4.8)
5. **Barındırma yeri** — yurt içi zorunluluğu var mı?
6. **Bütçe/harcama** takip mi, muhasebe entegrasyonu mu?

### Araştırma görevi (T5/T3.3/T4.8'e girmeden önce)

Bu alanların hiçbirinde kesin bilgimiz yok ve tahminle tasarlamak pahalıya
patlar. Girmeden önce şu kaynaklar taranmalı:

- YÖK ve üniversitelerin **öğrenci kulüpleri yönergeleri** (çoğu kurum kendi
  yönergesini sitesinde yayımlıyor — birkaç farklı üniversiteninki karşılaştırılırsa
  ortak iskelet çıkar)
- Kurumların **SKS daire başkanlığı** sayfalarındaki başvuru formları ve süreç
  akışları — gerçek iş akışının en doğru kaynağı
- KVKK Kurumu'nun **veri sorumlusu/veri işleyen** rehberleri (SaaS için kritik)
- Sosyal/etkinlik transkripti uygulayan üniversitelerin örnek belgeleri

**Tasarım ilkesi:** Bu araştırma sonucunda çıkacak kurallar kurumdan kuruma
değişecek. Ürün tek bir kurumun sürecini gömmek yerine, **kurumun kendi sürecini
kurabileceği esneklik** sunmalı (onay kademeleri, form alanları, eşikler —
`tenant_settings` altyapısı bunun için var). Amaç işi zorlaştırmak değil
kolaylaştırmak.

---

## 10. Uzak fikirler (henüz roadmap'te değil)

Kaydedilmiş ama olgunlaşmamış; şu an planlanmıyor.

### Öğrencinin gelir elde edebileceği yapı

Fikir aşamasında. Muhtemel yönler: sponsorlu etkinliklerde görev alma, ücretli
atölye/eğitim düzenleme, kulüp ürünü satışı.

**Neden şimdi değil:** Para akışı ürüne girdiği anda vergi, sigorta, öğrenci
statüsü ve üniversite mevzuatı devreye giriyor. Bir öğrencinin üniversite
platformu üzerinden gelir elde etmesi hukuki olarak basit değil ve yanlış
kurgulanırsa hem öğrenciyi hem kurumu riske atar. Ticarileşme (M8) sonrası,
ayrı bir hukuki analizle ele alınmalı.

---

## 11. Yönetici notu — öncelik gerekçesi

**M1 neden birinci ve neden "demo" olarak şekillendi:** Bugün 21.000 satır
backend ve 345 test var, ama hiçbiri gerçek kullanıcıyla temas etmedi.
Eklediğimiz her özellik (bildirim tercihleri, okul geneli duyuru, oturum iptali)
bir kullanıcı talebinden değil, çıkarımdan doğdu. Bu, yanlış şeyi mükemmel yapma
riskidir.

Pilot fırsatı (staj bağlantısıyla Antalya Bilim Üniversitesi) bu riski kapatacak
tek somut yol. Ama kurumu ikna eden şey özellik listesi değil, **çalışan bir
hikâye** olur. Bu yüzden M1 "frontend'e başla" değil, "afişten yoklamaya kadar
tek bir akışı uçtan uca göster" olarak tanımlandı. Tek kişilik kapasitede geniş
bir M1 aylarca bitmez ve gösterilecek bir şey çıkmaz; dar ve tam bir dilim
haftalar içinde gösterilebilir.

**M2 neden ikinci:** Ürünün kurumda kalıcı olmasını sağlayan şey öğrenci
deneyimi değil, **SKS'nin işini kolaylaştırması**. Başvuru inceleme ve resmî
çıktılar olmadan kurum Excel'e geri döner ve ürün "güzel ama kullanmıyoruz"
konumuna düşer.

**Entegrasyon (M7) neden geç:** En pahalı ve en çok kuruma-özel iş. Manuel içe
aktarım fallback'i erken varsa, entegrasyon olmadan da ürün çalışır. Pilot
kurumun gerçek OBS'i görülmeden adaptör tasarlamak israf olur.
