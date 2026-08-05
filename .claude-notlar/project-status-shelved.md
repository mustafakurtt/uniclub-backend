---
name: project-status-shelved
description: "uniclub-backend durumu — raftan indirildi (2026-07-17): feature geliştirmeye dönüldü, Events feature'ı başladı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 088967fb-8cec-4fe7-8ea6-626e2eddd565
  modified: 2026-07-25T20:38:56.158Z
---

**GÜNCELLEME 2026-07-17:** Proje raftan indirildi. Kullanıcı artık core/cross-cutting yerine **feature** geliştirmek istiyor — amaç frontend'e (öğrenci + roller + sistem yönetimi) gerçek işlevsellik kazandırmak. Birlikte karar: **Events (Etkinlikler)** feature'ıyla başlanıyor. Kullanıcının tek net önceliği: **DB normalizasyonu + ilişkisel sağlık + sürdürülebilirlik** ("diğer taraflar hallolur").

Verilen mimari karar: etkinlik↔kulüp **M:N** (`activity_clubs` join, host/co_host) — 1:N `clubId` DEĞİL. İsim `events` DEĞİL **`activities`** (realtime `ServerEvent`/WS `{event:...}` çakışması). Sebep: co-hosting + cross-university turnuva'yı ŞEMA DEĞİŞMEDEN destekler (fark politika, yapı değil). `activities`'te `universityId` YOK (tenant host/co_host kulüplerden türetilir). Leaderboard/turnuva ileride AYRI domain, skor `activity_attendees`'e tıkıştırılmayacak.

**DURUM: Activities v1 TAMAMLANDI ve canlı DB'de uçtan uca doğrulandı (2026-07-17).** Şema (`activities`/`activity_clubs`/`activity_attendees` + 4 enum + tek-host partial unique index) + `relations.ts` + migration uygulandı + seed (5 örnek etkinlik dahil ⭐cross-university Hackathon: Antalya host + Ege co_host). Feature `src/features/activities/` (messages/types/schema/repository/service + routes/) university standardında yazıldı: HttpError + i18n katalog + `guard` YERİNE club.middleware `requireClubStaff` (kulüp alt-kaynağı). Endpoint'ler: keşif/RSVP `/api/activities` (scope=upcoming/past/all, tenant JWT'den), yönetim `/api/clubs/:clubId/activities` (host staff), `/api/users/me/activities`. Yeni bildirim tipleri `activity.published`/`activity.cancelled`. Docs: yeni `docs/frontend/FRONTEND_ACTIVITIES.md` + API.md/README güncel. Doğrulandı: cross-university keşif+izolasyon, members-only gate, kapasite (going sayılır/interested sayılmaz), host-yetkisi, iptal. typecheck temiz. NOT: `prom-client`+`web-push` node_modules'te eksikti, `bun install` ile kuruldu (sunucu onlarsız kalkmıyordu).

**Activities TAM (2026-07-17, "events tarafını bitirelim"):** ertelenen dilimlerin hepsi eklendi + test edildi (115 pass, typecheck temiz):
- **draft/publish**: create'e `publish` bool (vars. true); false→draft. `POST .../:activityId/publish` (host staff, yayınlayınca üye bildirimi). Taslaklar keşifte yok, kulüp listesinde YALNIZCA staff'a (isClubStaff).
- **check-in/yoklama**: `POST|DELETE .../attendees/:userId/check-in` (host staff, checked_in_at set/null; RSVP'siz→404).
- **co-host davet/kabul**: additive migration `activity_clubs.status` enum invited/accepted (default accepted → mevcut satırlar korunur). Endpoints (`:clubId`=işlemi yapan kulüp): `POST/GET/DELETE .../:activityId/co-hosts[/:coClubId]` (host), `POST .../:activityId/co-host/accept` + `DELETE .../:activityId/co-host` (co-host kulüp). **KRİTİK KURAL: yalnızca `accepted` bağ tenant/görünürlük/keşifte sayılır** — invited co-host henüz katılan kulüp değil (listForUniversity + resolveViewable + getDetail accepted filtreler). Cross-uni turnuva bu davet akışıyla gerçekten kurulabiliyor (test edildi: Ege davet edilince görünmez, kabul edince Ege keşfinde çıkar). Yeni bildirim `activity.coHostInvited`.

**Hâlâ sonraki dilim (activities):** rsvp waitlist mantığı (enum hazır), leaderboard/turnuva skorlaması (ayrı domain), activities cache yok (dinamik). Not: node_modules'te prom-client+web-push eksikti → `bun install` ile kuruldu.

**Media (dosya yükleme) feature TAMAM (2026-07-18):** URL-string sürtünmesi çözüldü. `core/storage` (taşınabilir port + LocalDiskStorage + InMemoryStorage + mime helpers, cache/ratelimit deseni) → `shared/storage/storage.client.ts` (env STORAGE_DRIVER'dan) → `media` feature (messages/types/repository/service/routes; media TABLOSU: uploaderId/universityId/storageKey/contentType/sizeBytes/purpose). Akış: `POST /api/uploads` (multipart) → `{id,url}` → URL mevcut *Url alanlarına yazılır (endpoint'ler değişmedi). Public servis `GET /uploads/:key` (immutable cache). GÜVENLİK: yalnızca görsel, tip MAGIC-BYTE'tan (sniffImageMime — SVG YOK/XSS), rastgele uuid key (istemci adı kullanılmaz→traversal yok), key regex + LocalDiskStorage safePath, boyut MAX_UPLOAD_BYTES(5MB), silme yalnızca yükleyen. env: STORAGE_DRIVER(local/memory)/UPLOAD_DIR/MAX_UPLOAD_BYTES/UPLOAD_PUBLIC_BASE_URL. Global bodyLimit /api/uploads için ATLANIR (kendi limiti). uploads/ gitignore'da. tests/setup STORAGE_DRIVER=memory. 127 test pass, typecheck temiz, canlı doğrulandı (upload→serve bayt eşit, sahte-görsel reddi). NOT: yerel disk yüklemeleri Postgres yedeğinde DEĞİL → UPLOAD_DIR ayrı yedeklenmeli (ops boşluğu, kullanıcıya söylendi). TS quirk: BodyInit/BlobPart Uint8Array view'ı kabul etmiyor → `.buffer.slice()` ile ArrayBuffer'a kopyalanır.

**STANDART UYUMU (2026-07-17):** Kullanıcı uyardı — activities+dashboard'da cache+permissions dosyalarını (university/announcements standardı) kendi kararımla atlamıştım; düzeltildi. Eklenenler: `activities.permissions.ts` (`activity.moderate` — tenant moderasyon, announcement.moderate deseni) + admin moderasyon rotası `POST /api/admin/universities/:uid/activities/:id/cancel` + rbac-catalog/auth.service wiring. `activities.cache.ts` (SEÇİCİ: detail + discovery read-through cache'lenir + mutasyonlarda invalidasyon; listByClub cache'lenMEZ çünkü viewer-bağımlı). `dashboard.permissions.ts` (`dashboard.view` — admin dashboard guard'ı user.view'dan buna çevrildi) + `dashboard.types.ts` + `dashboard.cache.ts` (kısa 30s TTL, invalidasyonsuz — sayaçlar staleness-toleranslı). Audit düzeltmeleri: listByClub artık `activity_clubs.status='accepted'` filtreler (invited co-host kendi listesinde görmez), ölü `getClubIds` kaldırıldı. **KRİTİK CACHE DERSİ:** jsonCodec cache'te Date'i string'e çevirir → cache'lenen detay YAZMA-YOLU mantığında (rsvp'de `startsAt.getTime()`) kullanılınca patlar (500); `new Date(detail.startsAt)` ile coerce edildi. university.cache'te bu sorun yok çünkü cache'li veri yalnızca JSON çıktısına gider. 121 test pass, typecheck temiz, canlı doğrulandı.

**Dashboard/Feed feature TAMAM (2026-07-17):** yeni `src/features/dashboard/` OKUMA MODELİ (yeni tablo yok, clubs/announcements/activities/üyelik/başvuru'yu birleştirir). 4 yüzey, hepsi test edildi (120 pass toplam, typecheck temiz): `GET /api/feed` (öğrenci akışı = onaylı kulüplerimin duyuru+yayınlanmış etkinlikleri, createdAt ekseni, k-yollu merge + keyset cursor), `GET /api/users/me/dashboard` (öğrenci özeti — users.service dashboardService'e delege), `GET /api/clubs/:clubId/dashboard` (staff, management.routes'a eklendi requireClubStaff), `GET /api/admin/universities/:uid/dashboard` (guard user.view + tenantScoped, admin.routes). i18n katalog kaydedildi, docs/frontend/FRONTEND_DASHBOARD.md + API.md/README güncel. Feed timestamp bilinçli createdAt ("ne yeni") — "yaklaşan" farklı görünüm (activities scope=upcoming).

**CACHE 2. NESİL — university PİLOTU (2026-07-25):** Kullanıcı feature seam'indeki
cache kullanımını "uzun ve karmaşık" bulup üst seviyeye çıkarmayı istedi. Teşhis: motor
(`core/cache/Cache`) iyi, dert dikişte — her `<feature>.cache.ts` aynı bilgiyi ÜÇ paralel
listede tekrarlıyor (keys/okuma/invalidasyon), değer tipi hiç beyan edilmemiş (`<T>`
loader'dan), ve invalidasyon 12 servis yazma yolunda ELLE eşleştiriliyor (unutulursa hata
SESSİZ). Eklenen: `core/cache/keyspace.ts` (`defineKeyspace`/`entry`/`effect`/`dropEntries`
— tipli girdi = anahtar+tip+TTL tek beyanda, `read`/`drop` aynı nesneden) +
`core/cache/invalidates.ts` (`invalidates()` Hono middleware'i + `fromParams`).
**KARAR: efekt = tek doğruluk kaynağı (keyspace'te), rota middleware'i = varsayılan
tetikleyici, `effect.emit()` = HTTP dışı yazarlar için kaçış kapağı. Kural: HTTP'den
ulaşılabilen mutasyonu ROTA bildirir, servis cache'i hiç bilmez.** Hata politikası:
`emit` fırlatır, middleware yakalayıp error loglar ama isteği DÜŞÜRMEZ (yazma zaten
başarılı; TTL telafi eder). **AYNI OTURUMDA 2. TUR — TÜM feature'lar geçirildi (196 test pass, typecheck temiz):**
- **Yarış kapatıldı** (`core/cache/cache.ts`): read-then-write. `loading: Map<key,sayaç>`
  getOrSet'in İLK await'inden ÖNCE senkron işaretlenir (inFlight'a kayıt çok geç kalıyordu —
  ilk denemem bu yüzden testte patladı); `delete` çakışırsa işaretler, yükleme biterse
  değeri çağırana döndürür ama cache'e YAZMAZ. Süreç-yerel; instance'lar arası yarış açık.
- **7 feature'ın hepsi keyspace+effect'te.** TETİK YERİ karara bağlı: university=rota
  (`invalidates`), clubs/activities/auth/admin=serviste `emit`. Gerekçe (kullanıcıya
  "her şeyi rotadan otomatik türetelim" fikrine karşı sunulan 3 KANIT): (1) `activities`
  efektinin `universityIds`'i DB sorgusundan gelir (cross-uni co-host), (2) `clubs.joinClub`
  invalidasyonu KOŞULLU (yalnızca membership "approved" ise), (3) `auth` katalog
  invalidasyonu per-user RBAC cache invalidasyonuyla iç içe. dashboard efektsiz (TTL 30s).
- **Otomasyonun otomatikleşebilen kısmı**: `uncoveredEntries()` + `tests/unit/cache-coverage.test.ts`
  — hiçbir efektin düşürmediği girdi = kalıcı bayat; yeni girdi efekte bağlanana kadar test
  KIRMIZI. dashboard orada adı geçen bilinçli istisna.
- **CLAUDE.md güncellendi**: yeni Caching bölümü + feature listesine activities/dashboard/
  media/moderation eklendi + **Error handling bölümü düzeltildi** (düz `Error` konvansiyonunu
  anlatıyordu, oysa kod `HttpError`+MessageKey+`app.onError`'a geçmiş; `respondWithBusinessError`
  artık rotalardan çağrılmıyor).

Testler: `tests/unit/cache-keyspace.test.ts`, `tests/unit/cache-coverage.test.ts`,
`tests/university-cache.test.ts` (entegrasyon; `invalidates` satırı silinince kırmızıya
döndüğü mutasyon denemesiyle kanıtlandı). DİKKAT: `bun run test` tek başına DB'yi
sıfırlamaz → register testleri 400 verir; `bun run test:all` kullan.

**3. TUR — `docs/cache/` yol haritası + 3 madde daha uygulandı (207 test, typecheck temiz):**
Kullanıcı "docs altına klasör aç, roadmap hazırla, cache'i üst düzeye çıkarmaya devam et"
dedi. Yazılanlar: **`docs/cache/README.md`** (katmanlar, 6 değişmez, feature sözleşmesi,
tetik-yeri karar kaydı, strateji tablosu, ölçüm, tuzaklar) + **`docs/cache/01-yol-haritasi.md`**
(19 madde, 6 faz, her biri sorun/çözüm/maliyet/değer/risk + durum etiketi).
**Sıralama ilkesi: önce GÖRÜNÜRLÜK, sonra DOĞRULUK, en son PERFORMANS.**
Uygulananlar:
- **#1 Metrikler**: `core/cache/cache.metrics.ts` (arayüz + no-op) → `shared/cache` prom-client.
  `uniclub_cache_operations_total{namespace,result}` + `..._duration_seconds{namespace,operation}`.
  Okuma sayımı `tryGetRaw`'da TEK yerde (get+getOrSet aynı yoldan). `error` ≠ `miss`
  (fail-open yüzünden Redis arızasının TEK sinyali). Etiket namespace, ASLA anahtar.
  **Canlı doğrulandı: aynı istek miss'te 93ms, hit'te 2ms.**
- **#3 `richCodec` VARSAYILAN**: Date → `{"__d":"<ISO>"}`. İki tasarım tuzağı elendi:
  regex-reviver (kullanıcının tarih metnini Date sanardı) ve `__t` kaçış sarmalaması
  (sonsuz özyineleme — sarmalanan nesne yine `__t` taşıyor). Kural: cache'lenen veride
  `__d` alan adı YASAK. `activities`'teki elle `new Date()` yaması artık gereksiz.
- **#4 Şema damgası**: `defineKeyspace(..., { version: 2 })` → `university:v2:…`.
  Şekil değişikliği sessizdir (eski girdi GEÇERLİ JSON, sadece eksik alanlı) —
  `tryDecode` yakalayamaz. Şu an kullanan yok, mekanizma hazır.
- Ayrıca `safeStoreGet` instance bayrağı yerine `{raw, errored}` döndürüyor (eşzamanlı
  okumalar bayrağı birbirinden çalıyordu).

**#6 DEVRE KESİCİ + ZAMAN AŞIMI DA UYGULANDI (222 test yeşil).** Burada tasarımda
gözden kaçan bir şey ÖLÇÜMLE ortaya çıktı: Redis konteyneri durdurulup ölçüldüğünde
tek cache okuması **43 476 ms** sürdü. Sebep: **ioredis bağlantı kopunca hata VERMEZ,
komutu kuyruğa alıp yeniden dener → çağrı ASILI KALIR.** Devre kesici yalnızca DÖNMÜŞ
hataları sayabildiği için tek başına ASLA tripleyemezdi. Çözüm iki dekoratör ve SIRASI
kritik: **`CircuitBreaker( Timeout( Redis ) )`** — içteki `TimeoutCacheStore` (200 ms)
asılı çağrıyı sayılabilir hataya çevirir, dıştaki `CircuitBreakerCacheStore` (5 ardışık
hata → 5 sn açık → tek yoklama) sayar ve artık hiç denemez. **Ölçülen sonuç: 43476 ms →
435 → 427 → 215 → 0 ms.** Karar: devre AÇIKKEN hata FIRLATILIR, sessiz boş sonuç
dönülmez — sessiz dönseydi Cache bunu `miss` sayar ve arıza metriklerde kaybolurdu.
Yeni metrik: `uniclub_cache_breaker_transitions_total{from,to}` (closed→open alarma bağlanacak).

**⚠️ AYNI SORUN CACHE DIŞINDA DA VAR (kullanıcıya bildirildi, YAPILMADI):**
`rate-limit.middleware.ts` paylaşılan `redis` istemcisini DOĞRUDAN kullanıyor
(`RedisRateLimitStore(redis)`) → Redis arızasında **giriş yapmak 43 sn sürer**.
`shared/rbac/rbac.cache.ts` ise `cache` facade'ından geçtiği için ARTIK KORUMALI.
notifications pub/sub + WS bileti + BullMQ de açık. Çözüm aynı desen ama `RateLimitStore`
ayrı port → `TimeoutCacheStore` kullanılamaz, kardeşi yazılmalı. Roadmap'te §6b olarak
kayıtlı; kullanıcı karar verecek.

**4. TUR — REDİS SERTLEŞTİRME (`docs/cache/02-redis-sertlestirme.md`):** Kullanıcı
"cache yeterince iyi mi, redis'i de güçlendirelim mi" diye sordu. Cevabım: cache
YETERİNCE İYİ, durmalı (kalan maddeler ÖLÇÜM ister); asıl risk Redis'te. Yapılanlar:
- **`commandTimeout: 500` paylaşılan Redis istemcisine** (`shared/redis/redis.client.ts`).
  Port başına timeout sarmalayıcısı yazmaktan DOĞRU katman: rate-limit + WS bileti +
  notifications publish hepsi birden korundu. **Ölçüldü: Redis kapalıyken giriş
  43 476 ms → ~600 ms, HTTP 200 (fail-open korundu).** subscriber ve BullMQ bilinçli
  kapsam dışı (ayrı bağlantılar).
- **`maxmemory` eklendi** (dev 256mb, prod `${REDIS_MAXMEMORY:-512mb}`) — önceden
  SINIRSIZDI, host RAM'ini doldurup OOM'a gidebilirdi.
- **`volatile-lru` DENENDİ ve GERİ ALINDI.** Mantığım "TTL'siz BullMQ iş verisi
  tahliye edilmez" idi; test koşusunda **BullMQ'nun kendi runtime kontrolü uyardı**
  ("It should be noeviction"). Çıkarım eksikmiş — BullMQ'nun iş KİLİTLERİ TTL taşıyor,
  tahliye edilirse aynı iş iki kez işlenir (mükerrer mail). `noeviction`'da kalındı.
  DERS: kütüphanenin açık gereksinimi kendi çıkarımına tercih edilir.
- **DÜZELTME:** ilk analizde "prod'da AOF kapalı" demiştim — YANLIŞ, dev konteynerine
  bakmıştım. `docker-compose.prod.yml` zaten `--appendonly yes` + volume taşıyor.

**REDİS'TE KALANLAR (karar bekliyor, docs/cache/02'de):** (1) rate-limit devre kesicisi
— `commandTimeout` 600 ms'e indirdi ama arıza boyunca HER giriş bunu ödüyor, cache'te
devre kesici sıfıra indiriyor; `RateLimitStore` ayrı port olduğu için kardeş sınıf
gerekli. (2) **Redis ŞİFRESİZ** (dev+prod) — prod'da port publish edilmiyor ama docker
ağındaki her konteyner biletleri okuyup FLUSHALL çekebilir; `REDIS_URL`'in her yerde
eşzamanlı değişmesi gerektiği için KOORDİNELİ deploy işi, sessizce yapılmadı.
(3) Cache'i ayrı Redis instance'ına almak (maxmemory-policy INSTANCE genelidir, DB
index'i başına değil → "ayrı DB" tahliyeyi ayırmaz). (4) `used_memory` %80 alarmı —
noeviction seçildiği için bellek dolması artık YAZMA HATASI demek.

**5. TUR — YÜK TESTİ (`perf/` + `docs/PERFORMANS.md`).** Kullanıcı "sunucudaymış gibi
performans testi yap, ne kadar yük kaldırıyoruz" dedi. Kuruldu: `perf/load.ts` (bağımsız
yük üreteci — ısınma atlar, yüzdelik hesaplar, gövdeyi tüketir), `perf/run.ts` (HTTP
senaryoları, `PERF_CONNECTIONS=1,50,200` süpürme), `perf/backend.ts` (ham Redis vs
Postgres), `perf/micro.ts` (codec/dekoratör mikro-ölçüm), `perf/README.md`,
`bun run perf` script'i. Sunucu AYRI SÜREÇTE prod modunda (port 3100).

**SONUÇLAR (Windows dev makinesi, seed verisi — mutlak değil karşılaştırmalı):**
- **Doygunluk 50–200 eşzamanlı arası.** eşz=50: cache'li liste 6153 RPS/p50 7.8ms,
  `/auth/me` 10 684 RPS, DB sorgusu 2497 RPS. eşz=200: RPS ARTMIYOR (5597) ama gecikme
  4× (34.6ms). **Hiçbir seviyede 0 hata.**
- **Cache 2.5–3.8× kazandırıyor** (eşz=1'de dürüst ölçüm): kulüp listesi 616 vs 162 RPS,
  uni byId 1146 vs 461. Küçük listede sadece 1.3×. İki KONTROL senaryosu (arama + auth/me)
  iki koşuda da aynı çıktı → ölçüm geçerli.
- **BÜYÜK TUZAK, düşüldü ve düzeltildi:** ilk koşuda cache KAPALI daha hızlı çıktı
  (14 625 vs 6153). Sebep cache değil **SINGLE-FLIGHT** — 50 sanal kullanıcı aynı anahtarı
  istediği için cache'siz koşuda 50 istek ~1 DB sorgusuna çöktü. Dürüst karşılaştırma
  EŞZAMANLILIK=1'de yapılır. perf/README'ye uyarı olarak yazıldı.
- **Hipotezim çürütüldü:** "eklediğim richCodec+timeout+breaker yavaşlatıyor" sandım;
  mikro-ölçüm 4.3 µs/istek çıkardı (fark 4.5 ms idi) = %0.6. Katmanlar kalsın.
- **Redis DARBOĞAZ DEĞİL:** 50 eşzamanlıda 20 236 ops/sn (Postgres 7 846). → **Yol
  haritası #8 (katmanlı L1/L2 cache) İPTAL EDİLDİ**, gerekçesi çürüdü. Gerçek darboğaz
  DB yolu (2500 RPS tavan) → ölçekte ilk yatırım DB tarafı (indeks/havuz/replika).

**6. TUR — KAYIT SELİ SENARYOSU ("100k izleyicili yayıncı siteyi gösterse ne olur?").**
`perf/register.ts` eklendi (test DB'sine karşı koşar, gerçek kayıt oluşturur).
**ÖLÇÜLENLER:**
- **bcrypt = 102.9 ms/hash**, 20 paralel → sadece **21 hash/sn** (12 çekirdekli makinede).
  `verifyPassword` 90 ms → aynı sınır GİRİŞ için de geçerli.
- Kayıt: **başarılı 30.5 RPS / p50 2258 ms**; **reddedilen (bilinmeyen domain) 1454 RPS**.
- **En kritik bulgu: kayıt seli TÜM SİTEYİ vuruyor.** Okuma p99 **8.11 ms → 397 ms**
  (49×), verim 5038 → 479 RPS (10×). Kayıt yolu farkında olmadan bir DoS vektörü.
- **Çözüm ÖLÇÜLDÜ (bulkhead):** kayıt eşzamanlılığı 50 yerine 4 → okuma p99 345→**34 ms**,
  okuma verimi 479→**1703 RPS**, kayıt verimi yalnızca %28 düşüyor (21.7→15.7/sn),
  kayıt olanın beklemesi 2614→**245 ms**. Yani sınırsız eşzamanlılık KİMSEYE yaramıyor.
- **Kazara en güçlü koruma:** kayıt tenant'ı e-posta DOMAİNİNDEN çözüyor → gmail/hotmail
  ile gelen kalabalık 400 alır, bcrypt'e hiç ulaşamaz. IP rate limit (30/dk) 100k farklı
  IP'ye karşı işe yaramaz; o limit tek saldırgan içindir.
- Mail kuyruğu ayrı tavan: 100k iş Redis'e sığar (~50MB/512MB) ama SMTP 10-50 mail/sn →
  saatler.
- Test betiği hatası yaşandı: `firstName: "S"` şema doğrulamasına takıldı, 65k istek
  "başarılı kayıt" sanılıp aslında reddedilme ölçülmüştü → düzeltildi (artık probe isteği
  201 doğruluyor).

**ÖNERİ SIRASI (docs/PERFORMANS.md §4b):** (0) eşzamanlı bcrypt semaforu — ÖLÇÜLEN EN
BÜYÜK KAZANÇ, her şeyden önce gelir. (1) ön kapı koruması (Cloudflare/CAPTCHA/sıra sayfası).
(2) yatay ölçekleme (kayıt CPU-bağımlı → doğrusal). (3) kaydı asenkronlaştırmak (UX değişir).

SIRADAKİ: bcrypt semaforu, rate-limit devre kesicisi, sonra ÖLÇÜME BAKARAK:
#13 ETag/304 ucuz kazanç, #8 katmanlı L1/L2 ancak metrikler yüksek Redis trafiği
gösterirse. Roadmap'te "hangi gözlem hangi eylemi gerektirir" tablosu var.
`hono-core` kopyası bu dilimlerin HİÇBİRİNİ içermez (bkz. [[hono-core-extraction]]).

---
2026-07-11'de kullanıcı projeyi bilinçli olarak **rafa kaldırmıştı** ("yeter bu kadar") ve CV/portfolyoya bir proje olarak eklemeyi planlıyordu.

Son oturumda eklenen: ilk **entegrasyon test suite'i** (`tests/`, `bun test` + `test:setup`/`test:all`, izole `uniclub_test` DB + Redis DB1) — health, auth (register/login/tenant inference/suspended), RBAC guard matrisi (401/403/200 + tenant-scope + super_admin bypass), multi-tenant izolasyon. `src/index.ts` artık `app`'i export ediyor. CI'ya `test` job'ı eklendi. Commit `722efd1`, develop'a push edildi, CI + Release check **yeşil**.

**Bilinçli açık uç:** `develop`, `main`'in ~13 commit önünde ve **release edilMEDİ** — prod (laptop) hâlâ `v1.4.1`'de. Yani prod, develop'taki ops/RBAC fix'lerini + testleri içermez. Bu bir hata değil, karar. İleride release istenirse dokümandaki akış: PR develop→main + onay, `git tag v1.5.0`, `gh release create` → laptop otomatik deploy eder. `gh` masaüstünde kurulu değil (laptop'ta var). Kalan bilinen boşluk: lint script'i yok; `package.json` version alanı hâlâ "1.0.0" (tag'ler v1.4.x). Prod erişimi için bkz. [[desktop-prod-access]].
