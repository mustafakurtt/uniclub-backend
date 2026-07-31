# Redis Sertleştirme

> Bu belge cache klasöründedir çünkü buradaki bulguların hepsi cache çalışması
> sırasında **ölçümle** ortaya çıktı — ama konusu cache değil, Redis'in kendisidir
> ve etkilediği yüzey çok daha geniş: rate-limit (giriş yolu), WS biletleri,
> notifications pub/sub, BullMQ mail kuyruğu.

## Temel gerçek: bu tek Redis KARIŞIK yük taşır

| Yük | Anahtar | TTL? | Kaybolursa? |
|---|---|---|---|
| Feature cache | `university:*`, `clubs:*`… | ✅ (`CACHE_DEFAULT_TTL`) | Zararsız — DB'den yeniden hesaplanır |
| RBAC cache | `rbac:permissions:*` | ✅ | Zararsız |
| Rate-limit sayaçları | `ratelimit:*` | ✅ (`EXPIRE`) | Limit sıfırlanır (fail-open zaten politika) |
| WS biletleri | `ws:ticket:*` | ✅ (`SETEX 60`) | Kullanıcı yeniden bilet ister |
| **BullMQ iş verisi** | `bull:email-verification-queue:*` | ❌ (çoğu) | **Doğrulama e-postası kaybolur** |

Tek bir Redis instance'ında **tek bir bellek/tahliye politikası** olur. Atılabilir
veriyle kalıcı olması gereken veriyi aynı yerde tutmanın bedeli budur.

---

## ✅ Yapılanlar

### 1. `commandTimeout` — asılı kalmanın kökten çözümü

**Ölçülen sorun.** ioredis bağlantı koptuğunda komutu **hata vermez**, kuyruğa alıp
yeniden dener. Yani çağrı başarısız olmaz, **asılı kalır**. Redis konteyneri
durdurulup ölçüldü:

```
tek cache okuması : 43 476 ms
```

Uygulama fail-open olduğu için istek düşmez — ama o 43 saniye zaten ödenmiştir.
Arıza sessizce bir **gecikme arızasına** dönüşür.

**Çözüm.** `shared/redis/redis.client.ts` → `options: { commandTimeout: 500 }`.
Bu, **bu bağlantıyı kullanan herkesi** aynı anda korur. Ölçülen sonuç, Redis
kapalıyken gerçek giriş isteği:

```
login 1: HTTP 200 — 664 ms
login 2: HTTP 200 — 590 ms
login 3: HTTP 200 — 591 ms
```

**43 476 ms → ~600 ms**, üstelik giriş çalışmaya devam ediyor (fail-open).

**Neden doğru katman burası:** her port'a (`CacheStore`, `RateLimitStore`, …) ayrı
timeout sarmalayıcısı yazmak yerine tek bağlantı ayarı hepsini kapsar.
Kapsam dışı bırakılanlar bilinçli: `redis.subscriber` (uzun ömürlü abonelik,
komut zaman aşımı uymaz) ve BullMQ (kendi bağlantısını kurar, arka planda).

### 2. `maxmemory` + `noeviction`

**Bulunan durum:** `maxmemory 0` (sınırsız), `maxmemory-policy noeviction`.
Yani Redis host'un RAM'ini doldurana kadar büyüyebiliyordu → OOM killer.

**Yapılan:** dev 256 MB, prod `${REDIS_MAXMEMORY:-512mb}`. Politika `noeviction`
olarak KALDI.

**`volatile-lru` denendi ve geri alındı — kayda değer.** Mantık şuydu: "yalnızca
TTL'li anahtarları tahliye eder, TTL'siz BullMQ iş verisi korunur". Test koşusunda
**BullMQ'nun kendi çalışma-anı kontrolü uyarı verdi**:

```
IMPORTANT! Eviction policy is volatile-lru. It should be "noeviction"
```

Çıkarım eksikti: BullMQ'nun bazı anahtarları (iş **kilitleri**) TTL taşır;
tahliye edilirlerse aynı iş iki kez işlenebilir (mükerrer doğrulama e-postası).
**Kütüphanenin açık gereksinimi kendi çıkarımımıza tercih edildi.**

**Sonuç davranışı:** sınıra gelindiğinde tahliye değil **yazma hatası** olur.
Cache fail-open olduğu için okumalar DB'den servis edilmeye devam eder; BullMQ
enqueue ise gürültülü biçimde başarısız olur — sessiz bozulmaya yeğdir.

### 3. Prod'da AOF zaten açıkmış

`docker-compose.prod.yml` `--appendonly yes` + `redisdata` volume ile geliyor.
İlk incelemede dev konteynerine bakılıp "AOF kapalı" sanılmıştı; **prod için
dayanıklılık sorunu yok**. Dev'de AOF yok ve olmasına gerek de yok.

---

## 🟡 Yapılmayanlar (karar gerektirir)

### 4. Rate-limit için devre kesici

`commandTimeout` sayesinde giriş 43 sn yerine ~600 ms sürüyor, ama arıza boyunca
**her giriş** o 600 ms'i ödüyor. Cache'te devre kesici bunu sıfıra indiriyor
(5 hatadan sonra hiç denemiyor); rate-limit'te böyle bir şey yok.

`RateLimitStore` ayrı bir port olduğu için `CircuitBreakerCacheStore` doğrudan
kullanılamaz — kardeşi yazılmalı ya da devre kesici mantığı port-bağımsız hale
getirilmeli. **Maliyet düşük, kazanç 600 ms → 0.**

### 5. Redis kimlik doğrulaması (`requirepass`) yok

Şu an hem dev hem prod'da Redis **şifresiz**. Dev'de port `127.0.0.1`'e bağlı
olduğu için dışarı açık değil. Prod'da port hiç publish edilmiyor, yani yalnızca
docker ağından erişilebilir — ama **o ağdaki herhangi bir konteyner** oturum
biletlerini okuyabilir, rate-limit sayaçlarını sıfırlayabilir, `FLUSHALL`
çekebilir.

**Neden yapılmadı:** `REDIS_URL`'in her yerde (app, migrate, .env.prod) eşzamanlı
değişmesini gerektirir — koordineli bir deploy adımıdır, sessizce yapılmamalı.

### 6. Cache'i ayrı instance'a almak

Karışık yükün **kalıcı** çözümü. `maxmemory-policy` instance geneldir, DB index'i
başına DEĞİLDİR — bu yüzden "cache'i DB 1'e al" tahliyeyi ayırmaz. Ayrı bir
konteyner ise:

- cache Redis'i: `allkeys-lru`, AOF yok, kaybı zararsız
- iş/kuyruk Redis'i: `noeviction`, AOF açık

Böylece cache baskısı asla kuyruğu tehdit etmez. Bedel: bir konteyner daha, bir
env değişkeni daha (`CACHE_REDIS_URL`). Ölçekle birlikte anlamlı hale gelir.

### 7. Redis izleme ve alarm

`used_memory` %80'de alarm (noeviction ile bu, yazma hatalarına ~kalan mesafedir),
`connected_clients`, `rejected_connections`, `evicted_keys`. Grafana yığını zaten
var (bkz. [LOGLAMA.md](../LOGLAMA.md)); `redis_exporter` eklenerek beslenebilir.
Uygulama tarafında `uniclub_cache_breaker_transitions_total{to="open"}` zaten
Redis arızasının erken sinyalidir.

---

## Öneri sırası

1. **#4 rate-limit devre kesici** — ucuz, giriş yolundaki kalan 600 ms'i siler
2. **#7 izleme/alarm** — `noeviction` seçildiği için bellek dolması artık *yazma
   hatası* demektir; bunu önceden görmek şart
3. **#5 Redis şifresi** — koordineli deploy gerektirir, planlanarak yapılmalı
4. **#6 ayrı instance** — ölçek gerektirdiğinde
