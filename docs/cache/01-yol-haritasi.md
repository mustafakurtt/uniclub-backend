# Cache Yol Haritası — Profesyonelleştirme

Mevcut durum ve mimari kararlar için → [README.md](README.md).

**Sıralama ilkesi:** önce GÖRÜNÜRLÜK, sonra DOĞRULUK, en son PERFORMANS.
Ölçmeden optimize etmek, olmayan bir sorunu çözüp gerçek olanı gizler. Bu yüzden
Faz 1 tek maddedir ve önce o gelir.

**Durum etiketleri:** ✅ tamam · 🟡 sırada · ⚪ planlı · 🔵 değerlendirildi/ertelendi

---

## Faz 0 — Tamamlananlar (referans)

| # | Madde | Not |
|---|---|---|
| ✅ | Port/adaptör + codec ayrımı | `CacheStore` string-değerli; serialization ayrı katman |
| ✅ | `getOrSet` + single-flight | Eşzamanlı miss'te DB'ye tek sorgu |
| ✅ | Fail-open + `delete` istisnası | Bkz. README §2.1 |
| ✅ | Negatif cache'ten kaçınma | `null`/`undefined` yazılmaz |
| ✅ | Tipli keyspace + efektler | Anahtar/tip/TTL tek beyanda; efekt = tek doğruluk kaynağı |
| ✅ | `invalidates()` rota middleware'i | `guard()` ile aynı kompozisyon; 2xx'te tetiklenir |
| ✅ | Read-then-write yarışı (süreç içi) | Yükleme sürerken invalidasyon → sonuç yazılmaz |
| ✅ | Kapsam denetimi (`uncoveredEntries`) | Efektsiz girdi = kalıcı bayat → test kırmızı |
| ✅ | **Metrikler** (#1) | `uniclub_cache_*` serileri `/metrics`'te; canlı doğrulandı |
| ✅ | **Date-güvenli codec** (#3) | `richCodec` varsayılan; yaşanmış bug sınıfı kapandı |
| ✅ | **Şema damgası** (#4) | `defineKeyspace(..., { version })` |

---

## Faz 1 — Görünürlük

### 1. Cache metrikleri ✅ UYGULANDI

**Sorun.** Cache'in işe yarayıp yaramadığını **bilmiyoruz**. Hit oranı %95 mi %5 mi?
Hangi keyspace ölü? Redis ne kadar sürede cevap veriyor? Hiçbiri ölçülmüyor.
Bu bilinmeden Faz 3'ün (performans) her maddesi kumar olur.

**Çözüm.** `Cache` facade'ına opsiyonel bir `CacheMetrics` dikişi: `onHit`/`onMiss`/
`onError`/süre. core proje-bağımsız kalır (arayüz alır, prom-client bilmez); proje
`shared/cache/cache.client.ts`'te mevcut `uniclub_` registry'sine bağlar. Etiket
**namespace** olmalı, anahtar DEĞİL — anahtar kardinaliteyi patlatır.

Üretilecek seriler: `cache_operations_total{namespace,result=hit|miss|error}`,
`cache_operation_duration_seconds{namespace,op=get|set|delete}`.

**Maliyet** düşük · **Değer** yüksek (diğer her maddenin kararını bu besler) · **Risk** yok

> **Uygulandı.** `core/cache/cache.metrics.ts` (arayüz, no-op varsayılan) →
> `shared/cache/cache.client.ts` (prom-client bağlantısı). Seriler:
> `uniclub_cache_operations_total{namespace,result}` ve
> `uniclub_cache_operation_duration_seconds{namespace,operation}`.
> Okuma sayımı `Cache.tryGetRaw`'da tek yerde toplandı → `get` ve `getOrSet`
> aynı yoldan geçer. `error`, `miss`'ten AYRI sayılır: fail-open sayesinde istek
> düşmediği için Redis arızasının **tek** görünür sinyali budur.
> Canlı doğrulama: aynı public liste isteği miss'te 93 ms, hit'te 2 ms.

### 2. Cache-miss maliyeti görünürlüğü ⚪

Miss anındaki **loader** süresini de ölç (DB sorgusu ne kadar sürüyor). "Bu anahtarı
cache'lemeye değer mi?" sorusunun cevabı budur: ucuz bir sorguyu cache'lemek
Redis turu ekleyip hiçbir şey kazandırmaz. Faz 1.1 üzerine küçük bir ek.

---

## Faz 2 — Doğruluk sertleştirme

### 3. Date-güvenli codec ✅ UYGULANDI

**Sorun.** `jsonCodec` `Date`'i string'e çevirir. Cache'ten dönen veri sadece JSON
cevabına gidiyorsa zararsız; ama **yazma-yolu mantığında** kullanılırsa
(`startsAt.getTime()`) çalışma anında patlar. Bu `activities`'te bir kez yaşandı ve
elle `new Date(x)` coerce ile yamandı — yani tuzak hâlâ duruyor, sadece bir yerde
kapatıldı.

**Çözüm.** Etiketli (tagged) bir codec: encode sırasında `Date` → `{"__t":"d","v":"…"}`,
decode'da geri `Date`. ~25 satır, bağımlılık yok, kesin (ISO-benzeri string'leri
tahmin eden regex reviver'lardan farklı olarak yanlış pozitif üretmez). Wire formatı
değiştiği için eski girdiler decode edilemez → `tryDecode` onları miss sayıp siler,
yani geçiş kendi kendini onarır.

**Maliyet** düşük · **Değer** yüksek (yaşanmış bug sınıfını tamamen kapatır) · **Risk** düşük

> **Uygulandı.** `richCodec` artık `Cache`'in VARSAYILANI (`jsonCodec` bilinçli
> tercih olarak duruyor). Şema: `Date` → `{"__d":"<ISO>"}` tek anahtarlı işaretçi.
> Tasarım sırasında iki tuzak elendi: (a) ISO-benzeri string'leri regex'le
> yakalayan reviver — kullanıcının yazdığı tarih metnini sessizce `Date`'e
> çevirirdi; (b) `__t` taşıyan nesneleri sarmalayan kaçış mekanizması — sarmalanan
> nesne yine `__t` taşıdığı için sonsuz özyinelemeye giriyordu. Onun yerine kural
> yazıldı: *cache'lenen veride `__d` alan adı kullanmayın*.
> `activities.service.ts`'teki elle `new Date(...)` yaması artık gereksiz;
> savunma amaçlı bırakıldı ve yorumu güncellendi.

### 4. Deploy şema damgası ✅ UYGULANDI

**Sorun.** Bir repository sorgusuna kolon eklendiğinde eski cache girdisi **geçerli
JSON**'dur, sadece eksik alanlıdır. `tryDecode` bunu yakalayamaz (bozuk değil). Deploy
sonrası TTL boyunca (varsayılan 5 dk) eksik alanlı cevaplar döner.

**Çözüm.** Keyspace'e sürüm damgası: `defineKeyspace(cache, "university", specs,
{ version: 2 })` → anahtar öneki `university:v2:`. Şekil değişince sürüm artırılır,
eski anahtarlar erişilemez hale gelir ve TTL ile temizlenir. Alternatif: build
hash'ini global önek yapmak — her deploy tüm cache'i soğutur (basit ama pahalı).

**Maliyet** düşük · **Değer** orta-yüksek · **Risk** düşük (sürüm artırmayı unutmak
bugünkü davranışa döner, kötüleştirmez)

> **Uygulandı.** `defineKeyspace(cache, "university", specs, { version: 2 })`.
> Sürüm önekin İÇİNDE, namespace'ten sonra durur (`university:v2:…`) ki Redis'te
> `SCAN university:*` ve metrik etiketi bozulmasın. Şu an hiçbir keyspace sürüm
> kullanmıyor (gerek yok); mekanizma şekil değiştiren ilk deploy için hazır.
> **Disiplin maddesi:** cache'lenen bir repository sorgusunun kolon/ilişki
> kümesini değiştiren PR, o keyspace'in `version`'ını artırmalı.

### 5. Instance'lar arası yarış ⚪

**Sorun.** Süreç içi yarış kapatıldı (README §2.4), ama yazma A instance'ında,
okuma B instance'ındaysa B eski değeri yazabilir. Tek instance'ta konu değil;
yatay ölçeklenince gerçek olur.

**Çözüm seçenekleri.** (a) Anahtar versiyonlama: her namespace'e Redis'te bir sayaç,
invalidasyon = `INCR`, okuma anahtarı sürümü içerir. O(1) invalidasyon, ama her
okumaya bir tur daha ekler. (b) Gecikmeli çift-silme: invalidasyondan ~500 ms sonra
ikinci bir silme. Basit, olasılıksal. (c) Faz 3.7 (pub/sub) zaten kurulursa
invalidasyon yayını bu yarışı da büyük ölçüde kapatır.

**Maliyet** orta · **Değer** ölçeğe bağlı · **Risk** orta → **çok-instance'a
geçilmeden yapılmasın**

### 6. Redis devre kesici (circuit breaker) ⚪

**Sorun.** Redis düştüğünde fail-open sayesinde istekler DÜŞMEZ ama **her okuma**
yine de bağlantıyı deneyip timeout bekler. Yani cache arızası bir **gecikme
arızasına** dönüşür — cache'in tam da yardım etmesi gereken anda.

**Çözüm.** Store sarmalayıcısı: N ardışık hatadan sonra M saniye boyunca hiç
denemeden miss dön (yarı-açık durumla periyodik yoklama). `rate-limit`'teki
fail-open ilkesiyle aynı felsefe, bir adım ilerisi.

**Maliyet** orta · **Değer** yüksek (olay anında) · **Risk** düşük

### 7. Negatif cache (kontrollü) 🔵

Şu an `null` hiç cache'lenmiyor (README §2.2) — bu bilinçli. Ama var olmayan bir
kaynağa yoğun trafik gelirse (bot taraması, ölü link) her istek DB'ye iner.
**Değerlendirildi, ertelendi:** çözüm "yok" durumunu ÇOK kısa TTL'li ayrı bir
sentinel'le cache'lemek olurdu; mevcut trafik profilinde kazanç yok, karmaşıklık var.
Metrikler (Faz 1) bunun gerçek bir sorun olduğunu gösterirse yeniden açılır.

---

## Faz 3 — Performans

> **Bu fazın hiçbir maddesi Faz 1 (metrikler) olmadan başlamamalı.**

### 8. Katmanlı cache (L1/L2) + pub/sub invalidasyon yayını ⚪

**Sorun.** Her okuma Redis'e ağ turu atıyor. Üniversite ağacı gibi neredeyse hiç
değişmeyen veriler için bu saf israf.

**Çözüm.** `TieredCacheStore(memory, redis)`: okuma L1 → L2 → kaynak. Feature koduna
**hiç dokunmaz** (sadece store kompozisyonu değişir). Çok instance'ta A'nın
invalidasyonunun B'nin L1'ini düşürmesi için Redis Pub/Sub yayını gerekir — altyapı
`notifications`'ta zaten var (`shared/redis/redis.subscriber.ts`, ayrı bağlantı
zorunluluğu dahil).

**Yeni başarısızlık modu:** yayın mesajı kaybolursa o instance L1'inde TTL boyunca
bayat kalır → L1 TTL'i kısa tutulmalı (ör. 10-30 sn).

**Maliyet** yüksek · **Değer** trafiğe bağlı · **Risk** orta

### 9. Stale-while-revalidate (SWR) ⚪

TTL dolduğunda isteği bekletmek yerine **bayat değeri hemen dön**, arka planda
tazele. Kuyruk gecikmesini p99'dan siler. `dashboard` ve `activities.discovery` gibi
staleness-toleranslı okumalar için doğal. `Cache`'e `staleTtlSeconds` eklenmesi
gerekir (değer + yazılma zamanı birlikte saklanır).

### 10. Toplu okuma (MGET) / pipelining ⚪

`CacheStore` port'una `getMany` eklemek. Şu an tek tek okunan çoklu anahtarlar
(ör. bir listedeki her kulübün detayı) tur başına gidiyor. Port değişikliği
gerektirir; ancak gerçek bir N+1 cache okuması ortaya çıkarsa yapılmalı.

### 11. Sıkıştırma ⚪

Belirli bir boyutun üstündeki payload'ları codec katmanında sıkıştır (Bun'ın
`gzipSync`'i). Redis bellek ve ağ tasarrufu; CPU maliyeti. Metrikler büyük değerler
gösterirse anlamlı.

### 12. İstek-içi memoizasyon ⚪

Aynı istek içinde tekrarlanan özdeş okumaları tekilleştir (Hono context ya da
`AsyncLocalStorage`). Cache'e hiç gitmeden, süreç içinde. Küçük ama bedava kazanç;
tekrar eden okuma örüntüsü ölçülürse yapılır.

---

## Faz 4 — HTTP katmanı

### 13. ETag / 304 ⚪

**Sorun.** Cache HIT'te bile tam JSON gövdesi tel üzerinden gidiyor. Kayıt formunun
her açılışında çekilen üniversite/fakülte/bölüm ağacı buna en iyi örnek.

**Çözüm.** Public GET'lerde yanıt gövdesinin hash'ini `ETag` olarak dön; istemcinin
`If-None-Match`'i eşleşirse boş gövdeli `304`. Hono'nun `etag` middleware'i işi
görür; cache'lenen değerden doğrudan üretmek daha da ucuz olur.

**Maliyet** düşük · **Değer** orta (bant genişliği + istemci parse süresi)

### 14. `Cache-Control` politikası ⚪

Public ve gerçekten durağan uçlarda (`GET /api/universities`) tarayıcı/CDN
katmanının da devreye girmesi. Kimlik gerektiren hiçbir uçta **asla** `public`
kullanılmamalı — bu maddenin asıl işi o sınırı yazılı hale getirmek.

---

## Faz 5 — Operasyon

### 15. Namespace / tenant flush aracı ⚪

Destek senaryosu: "şu üniversitenin verisi tuhaf görünüyor". Bugün elle Redis'e
girmek gerekiyor. Bir CLI (`bun run cache:flush <namespace>`) + tenant bazlı flush
gerekir. `SCAN`+prefix ile yapılır (`KEYS` prod'da **asla**).

### 16. Redis bellek politikası ⚪

`maxmemory` + `maxmemory-policy` (`allkeys-lru` uygun) ve TTL disiplininin yazılı
hale getirilmesi. Şu an TTL'siz yazım mümkün (`ttlSeconds` verilmezse süresiz) —
bu, politika belirlenmeden bir bellek sızıntısı riskidir.

### 17. Cache ısıtma (warm-up) ⚪

Boot'ta ya da deploy sonrası en sıcak anahtarları (üniversite listesi) önceden
doldur. Soğuk-başlangıç dalgasını keser. Faz 2.4 (şema damgası) ile birlikte
anlamlı: her deploy cache'i soğutuyorsa ısıtma daha da değerli.

---

## Faz 6 — Politika ve disiplin

### 18. "Asla cache'lenmeyecekler" listesi ⚪

Yazılı kural: kişisel veri (PII), kimlik/oturum kararları, kişiye özel yetki
sonuçları (`shared/rbac/rbac.cache.ts` bunun **kontrollü** istisnasıdır ve
per-user invalidasyonu vardır), ödeme/sır içeren hiçbir şey. Yeni bir feature
cache eklerken bakılacak tek sayfa.

### 19. Keyspace envanteri ⚪

Tüm keyspace'leri, girdilerini, TTL'lerini ve efektlerini kodda gezip üreten bir
rapor (mevcut `uncoveredEntries` altyapısı bunun yarısını zaten sağlıyor). İnceleme
ve devir-teslim için.

---

## Öneri sırası

1. ~~**#1 metrikler**~~ ✅ — her şeyin kararını besler
2. ~~**#3 Date-güvenli codec**~~ ✅ — yaşanmış bug sınıfını kapatır
3. ~~**#4 şema damgası**~~ ✅ — ucuz, sessiz deploy hatasını önler
4. **#6 devre kesici** 🟡 — olay anındaki davranışı düzeltir (sıradaki)
5. Buradan sonrası **ölçüme bakarak**: #13 (ETag) ucuz kazanç, #8 (L1/L2) ancak
   metrikler yüksek Redis trafiği gösterirse

### Artık ölçebildiğimiz için sorulacak sorular

Metrikler geldiğine göre bir sonraki adımın kararı tahmine değil veriye bağlanabilir.
Grafana'da bakılacaklar:

| Gözlem | Anlamı / eylem |
|---|---|
| `namespace` bazında hit oranı düşük (< %50) | O keyspace'i cache'lemek boşa; ya TTL çok kısa ya anahtar çok dağınık |
| Hit oranı yüksek **ve** `get` süresi p99 yüksek | **#8 katmanlı L1/L2** gerçekten kazandırır |
| `result="error"` sıfırdan farklı | Redis sağlıksız → **#6 devre kesici** aciliyet kazanır |
| `set` sayısı ≈ `get` sayısı | Sürekli yeniden yazılıyor: ya invalidasyon çok agresif ya TTL çok kısa |
| Belirli namespace'te hiç trafik yok | Ölü cache — kaldırılabilir (karmaşıklık bedava değil) |
