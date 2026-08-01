# Performans ve Yük Testi

Ölçüm araçları `perf/` altındadır (bkz. [perf/README.md](../../perf/README.md)).
Bu belge **ölçüm sonuçlarını ve çıkarımları** tutar.

> **Ölçüm tarihi:** 2026-07-25 · **Ortam:** Windows 11 geliştirme makinesi,
> Postgres + Redis Docker Desktop konteynerlerinde, yük üreteci AYNI makinede.
> Sunucu `NODE_ENV=production`, `LOG_LEVEL=error`, `RATE_LIMIT_DISABLED=true`
> (limiti değil sistemi ölçmek için), port 3100, ayrı süreç, gerçek HTTP.
>
> ⚠️ **Bunlar üretim kapasitesi DEĞİLDİR.** Yük üreteci sunucuyla aynı CPU'yu
> paylaşıyor, veri kümesi seed'dir (3 üniversite, ~6 kulüp) ve Docker Desktop'ın
> ağ katmanı gerçek bir sunucudan farklıdır. Sayıların değeri **mutlak** değil,
> **senaryolar arası karşılaştırma** ve **doygunluk noktasının yeri**dir.

---

## 1. Kapasite: sistem nerede doyuyor?

Cache açık, senaryo başına 6 sn:

| Eşzamanlılık | Cache'li liste | Kimlikli okuma | DB'ye giden sorgu | Hata |
|---|---|---|---|---|
| **1** | 1169 RPS · p50 0.70 ms | 4550 RPS · p50 0.18 ms | 599 RPS · p50 1.40 ms | 0 |
| **50** | 6153 RPS · p50 7.83 ms | 10684 RPS · p50 4.05 ms | 2497 RPS · p50 19.6 ms | 0 |
| **200** | 5597 RPS · p50 34.6 ms | 8983 RPS · p50 22.0 ms | 2288 RPS · p50 87.0 ms | 0 |

**Okunuşu:**

- **Doygunluk 50 ile 200 arasında.** 1 → 50 arasında verim 5 kat artıyor (iş
  paralelleşiyor). 50 → 200 arasında verim **artmıyor, hatta düşüyor** (6153 →
  5597) ama gecikme **4 katına** çıkıyor (7.8 → 34.6 ms). Bu klasik doygunluk
  imzasıdır: kuyruk uzuyor, iş bitmiyor.
- **Pratik çalışma noktası ~50 eşzamanlı istek.** Orada p99 hâlâ 15 ms.
- **Hiçbir seviyede hata yok** — 200 eşzamanlıda bile sistem bozulmuyor, sadece
  yavaşlıyor. Dayanıklılık açısından iyi haber.
- **En pahalı yol DB'ye giden sorgu** (2500 RPS tavan). Cache'in var olma sebebi
  tam olarak bu farktır.

### Kaba bir üretim tahmini

Bir kullanıcı oturumu dakikada ~5 istek atıyorsa, 6000 RPS teorik olarak
~72 000 eşzamanlı aktif kullanıcıya karşılık gelir. Gerçek sayı bunun çok altında
olacaktır (üretimde yük üreteci CPU'yu paylaşmaz ama veri de daha büyüktür,
ağ gecikmesi de vardır) — yine de **bu ölçek için darboğaz uygulama değil**.

---

## 2. Cache gerçekten kazandırıyor mu? — EVET

**Ölçüm tuzağı ve düzeltilmesi.** İlk koşuda cache KAPALI yapılandırma daha hızlı
çıktı (14 625 vs 6153 RPS) — cache'in zararlı olduğu izlenimi verdi. Sebep cache
değil, **single-flight'tı**: `getOrSet` aynı anahtara gelen N eşzamanlı miss'i TEK
yüklemeye çökertir. 50 sanal kullanıcı hep AYNI listeyi istediği için, cache'siz
koşuda 50 istek ~1 DB sorgusuna indi ve cache'siz yol yapay olarak hızlı göründü.
Gerçek trafik farklı anahtarlara dağılır, böyle bir çökme olmaz.

**Dürüst karşılaştırma eşzamanlılık = 1'de yapılır** (çökecek eşzamanlı istek yok):

| Senaryo | Cache AÇIK | Cache KAPALI | Kazanç |
|---|---|---|---|
| Kulüp listesi (kimlikli) | **616 RPS · 1.38 ms** | 162 RPS · 5.66 ms | **3.8× verim, 4.1× düşük gecikme** |
| Tek üniversite (id'li) | **1146 RPS · 0.71 ms** | 461 RPS · 1.86 ms | **2.5× verim, 2.6× düşük gecikme** |
| Üniversite listesi | **1169 RPS · 0.70 ms** | 892 RPS · 0.89 ms | 1.3× verim |
| *Arama (kontrol — ikisinde de DB)* | *599 RPS · 1.40 ms* | *605 RPS · 1.40 ms* | *fark yok ✓* |
| *`/auth/me` (kontrol — cache'siz uç)* | *4550 RPS* | *4419 RPS* | *fark yok ✓* |

İki **kontrol senaryosunun** iki koşuda da aynı çıkması ölçümün geçerliliğini
doğrular: fark gerçekten cache'ten geliyor.

**Kural:** kazanç, cache'lenen sorgunun maliyetiyle ve payload boyutuyla orantılı.
Kulüp listesi (ilişkili veri, büyük payload) 3.8× kazanırken, 3 satırlık üniversite
listesi yalnızca 1.3× kazanıyor. **Ucuz sorguları cache'lemek neredeyse bedavaya
gelir ama neredeyse hiçbir şey de kazandırmaz.**

---

## 3. Redis darboğaz mı? — HAYIR

Ham arka uç kapasitesi (uygulama katmanı olmadan, `perf/backend.ts`):

| | Sıralı (eşz=1) | 50 eşzamanlı |
|---|---|---|
| `redis GET` | p50 0.523 ms · 1510 ops/sn | p50 2.43 ms · **20 236 ops/sn** |
| `postgres SELECT` (üni listesi) | p50 0.647 ms · 1303 ops/sn | p50 6.11 ms · **7 846 ops/sn** |

Redis, Postgres'in **2.6 katı** verim veriyor ve uygulamanın ulaştığı en yüksek
uçtan uca sayının (≈10 700 RPS) çok üstünde. Yani **Redis'i büyütmek/optimize
etmek şu an hiçbir şey kazandırmaz**; darboğaz uygulama katmanı ve DB.

Bu, yol haritasındaki **#8 katmanlı L1/L2 cache** maddesinin şu an
**GEREKSİZ** olduğunu söylüyor: Redis turu zaten pahalı değil.

---

## 4. Sertleştirme katmanlarının maliyeti — ihmal edilebilir

Dayanıklılık ve doğruluk için eklenen katmanlar ölçüldü (`perf/micro.ts`):

| İşlem | Süre | Not |
|---|---|---|
| `jsonCodec.decode` | 1.34 µs | eski varsayılan |
| `richCodec.decode` | 4.82 µs | **+3.5 µs** — Date koruması bedeli |
| `jsonCodec.encode` | 2.54 µs | |
| `richCodec.encode` | 4.23 µs | +1.7 µs |
| çıplak `store.get` | 0.10 µs | |
| `Timeout(store).get` | 0.80 µs | +0.7 µs — Promise.race + setTimeout |
| `CircuitBreaker(Timeout(store)).get` | 0.87 µs | +0.07 µs |

Toplam ek yük istek başına **≈4.3 µs**. Cache'li bir isteğin p50'si 700 µs
olduğuna göre bu **%0.6**. **Doğruluk ve dayanıklılık için ödenen bedel ölçülebilir
düzeyde bile değil** — bu katmanları kaldırmayı düşünmeye gerek yok.

> Not: ilk hipotezim bu katmanların "cache kapalı daha hızlı" sonucunu açıkladığıydı.
> Ölçüm bunu **çürüttü** (4.3 µs vs 4.5 ms fark) ve gerçek sebep single-flight
> çıktı. Hipotezi ölçmeden kabul etseydik yanlış şeyi optimize edecektik.

---

## 4b. KAYIT SELİ — "100 bin kişi aynı anda kayıt olursa?"

Yukarıdaki tablolar **okuma** yollarını ölçer. Kayıt tamamen farklı bir yoldur ve
darboğazı da farklıdır: **bcrypt**. Ayrı ölçüldü (`perf/register.ts`, test DB'sine
karşı — senaryo gerçek kayıt oluşturur).

### Önce en önemli gerçek: çoğu kişi zaten kayıt OLAMAZ

Kayıt akışı tenant'ı **e-posta domaininden** çözer (`auth.service register` 2. adım).
`gmail.com` / `hotmail.com` adresleri hiçbir üniversiteye ait olmadığı için **400**
alır. Yani rastgele bir yayın izleyicisi kitlesi sisteme giremez — ve bu, kazara,
en güçlü koruma katmanıdır.

| Yol | Verim | p50 | Ne yapıyor |
|---|---|---|---|
| **A. Reddedilen kayıt** (bilinmeyen domain) | **1454 RPS** | 32.7 ms | 1 DB sorgusu, bcrypt YOK |
| **B. Başarılı kayıt** (okul domaini) | **30.5 RPS** | **2258 ms** | domain + e-posta sorgusu + **bcrypt** + insert + mail kuyruğu |

100 000 **reddedilen** istek ≈ 69 saniyede eritilir.
100 000 **başarılı** kayıt ≈ **55 dakika** sürer.

### Darboğaç: bcrypt

| Ölçüm | Değer |
|---|---|
| Tek `hashPassword` | **102.9 ms** |
| Tek `verifyPassword` (giriş) | 90.0 ms |
| 20 paralel hash | 950 ms → **21 hash/sn** |
| Makinenin çekirdek sayısı | 12 |

bcrypt **bilerek** yavaştır (cost 10) — güvenlik özelliğidir, hata değildir. Ama
12 çekirdekli bir makinede bile ~21-31 hash/sn tavan koyar. **Kayıt hızını
belirleyen tek şey budur**; DB, cache, Redis bu tabloda hiç görünmez.

### ⚠️ Asıl bulgu: kayıt seli TÜM SİTEYİ yavaşlatıyor

Kayıt yükü koşarken eşzamanlı okuma ölçüldü:

| Durum | Okuma verimi | Okuma p50 | Okuma **p99** |
|---|---|---|---|
| Sakin | 5038 RPS | 3.57 ms | **8.11 ms** |
| Kayıt seli sırasında (eşz=50) | 479 RPS | 13.6 ms | **397 ms** |

**Verim 10 kat düşüyor, p99 gecikme 49 kat artıyor.** Yani sel yalnızca kayıt
olanları değil, siteyi o sırada kullanan HERKESİ vuruyor. Kayıt yolu, farkında
olmadan tüm uygulamaya karşı bir **hizmet engelleme (DoS) vektörü**.

### Çözüm ölçüldü: kayıt eşzamanlılığını sınırlamak (bulkhead)

Aynı test, kayıt eşzamanlılığı 50 yerine **4** ile:

| Kayıt eşz. | Okuma verimi | Okuma p99 | Kayıt hızı | Kayıt bekleme (p50) |
|---|---|---|---|---|
| **4** | **1703 RPS** | **34 ms** | 15.7/sn | **245 ms** |
| 50 | 479 RPS | 345 ms | 21.7/sn | 2614 ms |

Eşzamanlılığı sınırlamak:
- okumaları **3.5× hızlandırıyor**, p99'u **10× iyileştiriyor**
- kayıt verimini yalnızca **%28 düşürüyor** (21.7 → 15.7/sn)
- ve kayıt olanın kendi bekleme süresini **10× iyileştiriyor** (2.6 sn → 0.25 sn)

Yani sınırsız eşzamanlılık kimseye yaramıyor: ne siteye, ne kayıt olana. Klasik
**bulkhead** kalıbı burada net kazanç.

### 100k senaryosunun gerçek cevabı

1. **Çoğunluk 400 alır** (gmail/hotmail) — sistem bunu saniyede ~1450 istekle eritir.
2. **Gerçekten okul e-postası olanlar** ~21-31/sn hızla girer. 5 000 kişiyse ≈ 4 dakika,
   100 000 kişiyse ≈ 55 dakika.
3. **O süre boyunca site herkes için yavaş** (p99 8 ms → 397 ms) — bu düzeltilmezse
   asıl hasar burada.
4. **IP hız limiti (30/dk) bu senaryoda korumaz** — 100 bin kişi 100 bin farklı IP'dir.
   O limit tek bir saldırgana karşıdır, kalabalığa karşı değil.
5. **Mail kuyruğu ayrı bir tavan**: 100 bin iş Redis'e sığar (~50 MB, sınır 512 MB)
   ama SMTP sağlayıcıları tipik olarak 10-50 mail/sn kabul eder → **saatler**.

### Öneriler (etki sırasına göre)

| # | Öneri | Etki |
|---|---|---|
| 1 | **Kayıt/giriş için eşzamanlı bcrypt sınırı** (semafor, ~çekirdek sayısı kadar); kapasite dolunca kuyruk ya da 503 | Ölçüldü: okuma p99 10× iyi, kayıt beklemesi 10× iyi |
| 2 | **Ön kapı koruması** (Cloudflare/proxy hız limiti, sıra sayfası, CAPTCHA) | Yükün uygulamaya hiç ulaşmaması |
| 3 | **Yatay ölçekleme** | Kayıt CPU-bağımlı → instance sayısıyla doğrusal artar |
| 4 | Kayıt akışını asenkronlaştırmak (kabul et → kuyruğa al → worker'da hash'le) | En yüksek verim, ama UX değişir (hesap anında hazır olmaz) |

> `verifyPassword` de 90 ms'dir — aynı sınır **giriş** için de geçerlidir. Bir
> giriş seli de aynı etkiyi yaratır ve `login` rate limit'i e-posta bazlıdır,
> yani farklı hesaplarla gelen kalabalığı durdurmaz.

---

## 5. Çıkarımlar ve yol haritasına etkisi

| Bulgu | Karar |
|---|---|
| Redis, uygulamanın 2× üstünde kapasiteye sahip | **#8 katmanlı L1/L2 cache GEREKSİZ** — rafa kaldırıldı |
| Cache 2.5–3.8× kazandırıyor (büyük payload'da) | Cache stratejisi doğru; genişletmeye değer yer **büyük/ilişkili okumalar** |
| 3 satırlık liste yalnızca 1.3× kazanıyor | Küçük ve ucuz sorguları cache'lemek zorunlu değil |
| Doygunluk 50–200 eşzamanlı arasında | İzlemede **p99 > 25 ms** erken uyarı eşiği olarak kullanılabilir |
| DB'ye giden yol 2500 RPS tavanlı | Ölçek gerekirse ilk yatırım **DB tarafı** (indeks, havuz, replika) |
| Sertleştirme katmanları %0.6 | Kalsın |
| 200 eşzamanlıda 0 hata | Aşırı yükte bozulma değil yavaşlama — kabul edilebilir |
| **Kayıt 21-31/sn ile bcrypt'e bağlı** | Beklenen; bcrypt bilerek yavaş |
| **Kayıt seli okuma p99'unu 8→397 ms yapıyor** | ⚠️ **Açık risk** — eşzamanlı bcrypt sınırı gerekli (bkz. §4b) |
| Sınır 4 iken okuma p99 34 ms, kayıt verimi -%28 | Bulkhead kalıbı net kazanç, uygulanmalı |

### Sıradaki performans işleri (ölçüme dayalı)

0. **Eşzamanlı bcrypt sınırı** — ölçülen en büyük tek kazanç ve aynı zamanda bir
   güvenlik/dayanıklılık açığının kapatılması (bkz. §4b). Diğer her şeyden önce gelir.
1. **ETag/304** (yol haritası #13) — hâlâ mantıklı: gövde küçük olsa da her
   cache HIT'inde tel üzerinden gidiyor. Kazanç bant genişliğinde ve istemcide.
2. **DB tarafı** — 2500 RPS tavanı uygulamanın değil sorgunun. Gerçek veri
   büyüdüğünde ilk darboğaz burası olacak; `EXPLAIN ANALYZE` ile indeks gözden
   geçirmesi ölçekten önce yapılmalı.
3. **Gerçekçi veri kümesiyle yeniden ölçüm** — seed 3 üniversite/6 kulüp. Binlerce
   kayıtla cache kazancının ARTMASI beklenir (sorgu pahalılaşır), doygunluk
   noktasının ise DÜŞMESİ. Bu ölçüm o zaman tekrarlanmalı.

---

## 4. Postgres bağlantı havuzu (postgres-js)

Uygulama sunucusu ve CLI scriptleri **aynı havuz boyutunu paylaşmaz**. Varsayılanlar
`src/db/pool-config.ts` içinde; isteğe bağlı env ile override (zorunlu değil):

| Env | Varsayılan | Gerekçe |
|---|---|---|
| `DATABASE_POOL_MAX` | 10 | Tek Bun süreci; perf ölçümünde doygunluk ~50 eşzamanlı istek civarında. postgres-js varsayılanı 10; açık ayar ile tutarlı. |
| `DATABASE_POOL_IDLE_TIMEOUT` | 20 sn | Boşta bağlantıları kapat — postgres-js varsayılanı kapalı kalır; seed + test + dev üst üste gelince `max_connections` dolmasın. |
| `DATABASE_POOL_MAX_LIFETIME` | 1800 sn (30 dk) | Uzun ömürlü süreçte bağlantı rotasyonu. |
| `DATABASE_POOL_CONNECT_TIMEOUT` | 10 sn | DB yanıt vermezse hızlı fail. |
| `DATABASE_SCRIPT_POOL_MAX` | 2 | `db:seed`, `db:bootstrap` — kısa ömürlü, küçük havuz. |

Test preload (`tests/setup.ts`) süreç başına `DATABASE_POOL_MAX=4` set eder — `bun test`
paralel worker'ları aynı Postgres'e bağlanır.

---

## Testi tekrar koşmak

```sh
# 1) Sunucuyu ayrı süreçte, prod modunda başlat
NODE_ENV=production LOG_LEVEL=error RATE_LIMIT_DISABLED=true PORT=3100 bun run src/index.ts

# 2) Yükü uygula (eşzamanlılık süpürmesi)
PERF_CONNECTIONS=1,50,200 PERF_DURATION=6 bun run perf

# 3) Cache'in değerini ölç: sunucuyu CACHE_DRIVER=null ile yeniden başlat,
#    eşzamanlılık 1'de karşılaştır (single-flight çökmesi olmasın)
```

Ham arka uç kapasitesi: `bun run perf/backend.ts` ·
Codec/dekoratör mikro-ölçümü: `bun run perf/micro.ts`

---

## 6. Postgres bağlantı havuzu

`src/db/pool-config.ts` + `src/config/env.ts` (opsiyonel override, **zorunlu env yok**).

| Süreç | `max` | `idle_timeout` | `max_lifetime` | `connect_timeout` |
|---|---|---|---|---|
| Uygulama sunucusu (`src/db/index.ts`) | **10** (varsayılan) | **20 s** | **1800 s (30 dk)** | **10 s** |
| CLI scriptleri (`src/db/script-db.ts` — seed, bootstrap) | **2** | **10 s** | **300 s (5 dk)** | **10 s** |
| Test provision (`tests/provision.ts`) | **1** | — | — | — |

**Gerekçe:** Docker dev Postgres `max_connections≈100`. Perf ölçümünde doygunluk ~50 eşzamanlı istek; tek Hono süreci için `max=10` postgres-js varsayılanıyla uyumlu (~10 süreçe kadar yer). `idle_timeout` boşta kalan soketleri serbest bırakır (postgres-js varsayılanı: süresiz → kısa ömürlü script + test + dev üst üste gelince sızıntı). Script havuzu küçük tutulur; seed ardından `close()` ile bağlantı bırakılmaz.

**Override:** `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT`, `DATABASE_POOL_MAX_LIFETIME`, `DATABASE_POOL_CONNECT_TIMEOUT`, `DATABASE_SCRIPT_POOL_MAX`.

**Doğrulama (2026-08-01, `test:all` sonrası `uniclub_test`):** `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()` → **22** aktif oturum (`max_connections=100`). Sınıra yaklaşma yok; önceki sızıntı senaryosu (`too many clients`) idle timeout + script havuzu ile giderildi.
