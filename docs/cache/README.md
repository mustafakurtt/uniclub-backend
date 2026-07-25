# Cache Mimarisi — Mevcut Durum

**Kapsam:** `src/core/cache/` (taşınabilir motor) + `src/shared/cache/cache.client.ts`
(proje kurulumu) + `src/features/*/​*.cache.ts` (feature sözleşmeleri).

> Bu klasör cache'in **mimari kaydı** ve **yol haritasıdır**. Kodun kendisi
> yorumlarla belgelidir; burada *neden* ve *sırada ne var* durur.

| Dosya | İçerik |
|---|---|
| **README.md** (bu dosya) | Katmanlar, değişmezler (invariants), feature sözleşmesi, karar kayıtları |
| [01-yol-haritasi.md](01-yol-haritasi.md) | Profesyonelleştirme yol haritası — fazlar, her madde için sorun/çözüm/maliyet/risk |

---

## 1. Katmanlar

```
CacheStore (port)            core/cache/cache.store.ts
  ├─ InMemoryCacheStore      süreç içi, LRU + tembel TTL
  ├─ RedisCacheStore         paylaşımlı, TTL'i Redis'in EX'ine devreder
  └─ NullCacheStore          her okuma miss (cache'i kapatmak için)
        ↓
Codec                        core/cache/codec.ts
  ├─ richCodec (VARSAYILAN)  Date'i korur → {"__d":"<ISO>"}
  └─ jsonCodec               düz JSON (Date string'e döner)
        ↓
Cache (facade)               core/cache/cache.ts
   getOrSet + single-flight + namespace + fail-open + yarış koruması + ölçüm
        ↓
CacheMetrics (dikiş)         core/cache/cache.metrics.ts → shared/cache (prom-client)
        ↓
Keyspace + Effect            core/cache/keyspace.ts
   tipli girdi (anahtar + değer tipi + TTL) ve "hangi olay neyi bayatlatır"
        ↓
invalidates()                core/cache/invalidates.ts   (Hono middleware'i)
```

Sürücü `CACHE_DRIVER` env'inden seçilir (`redis` | `memory` | `null`), varsayılan
TTL `CACHE_DEFAULT_TTL` (300 sn). Testler `memory` sürücüsüyle koşar — hem koşu-başı
izolasyon sağlar hem InMemory adaptörünü gerçekten test eder.

## 2. Değişmezler (invariants)

Bunlar tasarım kararıdır, tercih değil. Değiştirmeden önce gerekçesini okuyun.

1. **Cache bir OPTİMİZASYONDUR, doğruluk kaynağı değildir.** Store okuma hatası
   miss'e düşer (fail-open, kaynağa gidilir); `getOrSet`'in iç yazımındaki hata
   yutulur. **İstisna:** açık `delete` hatayı YUTMAZ — invalidasyonu sessizce
   kaçırmak bayat veri demektir, çağıran ne yapacağına kendi karar vermeli.
2. **`null`/`undefined` cache'lenmez.** "Bulunamadı" durumu invalidasyonla
   temizlenemez → kalıcı yanlış sonuç riski. Varlık kontrolleri cache DIŞINDA,
   çağıran katmanda yapılır.
3. **Single-flight.** Aynı anahtar için eşzamanlı miss'lerde loader BİR kez koşar
   (stampede koruması). Süreç-yereldir; instance'lar arası koordinasyon amaçlanmaz.
4. **Read-then-write yarışı kapalıdır (süreç içi).** Yükleme sürerken gelen bir
   `delete`, o yüklemenin sonucunun cache'e yazılmasını engeller. Instance'lar
   arası aynı yarış hâlâ açıktır → [yol haritası #5](01-yol-haritasi.md).
5. **Arama sonuçları cache'lenmez.** Çok anahtar, düşük isabet. (`university`,
   `clubs`, `activities` — hepsinde aynı ilke.)
6. **Viewer-bağımlı okumalar cache'lenmez.** Sonucu çağırana göre değişen bir
   liste paylaşımlı anahtara sığmaz (`activities.listByClub`: staff taslak görür).

## 3. Feature sözleşmesi

Her feature `<feature>.cache.ts`'te İKİ şey bildirir, fazlası değil:

**Girdiler** — `defineKeyspace` + `entry<V>()`. Anahtar, değer tipi ve TTL tek
beyanda; `read(loader)` ve `drop()` aynı nesneden çıkar, ayrışamazlar. Değer tipleri
elle DTO yazılarak değil, repository sorgusundan türetilir
(`Awaited<ReturnType<typeof repo.method>>`) — sorgu değişince cache tipi sessizce
kaymasın diye.

**Efektler** — `effect(name, (params) => [entries])`. "Şu iş olayı olunca şu
girdiler bayatlar." Bu, **ne düşeceğinin TEK doğruluk kaynağıdır**; çapraz-feature
yazarlar (ör. `admin.service`) anahtarları bilmez, sadece efekti emit eder.

### Tetik nerede? (karar kaydı)

| Yol | Ne zaman | Kullanan |
|---|---|---|
| `invalidates(effect, fromParams(...))` **rotada** | Tüm parametreler istekten geliyorsa **ve** tetikleme koşulsuzsa | `university` |
| `effect.emit(...)` **serviste** | Parametre DB'den geliyor, tetik koşullu, ya da ilişkili başka bir invalidasyonun yanında duruyor | `clubs`, `activities`, `auth`, `admin` |

**"Her şeyi rotadan otomatik türetelim" fikri değerlendirildi ve REDDEDİLDİ.**
Kodda üç karşı örnek var ve üçü de sessizce yanlış sonuç üretirdi:

1. `activities` efektinin `universityIds` parametresi **DB sorgusundan** gelir
   (`getAcceptedUniversityIds` — bir etkinlik birden çok üniversitenin kulüpleri
   tarafından co-host edilebilir). Rota path'inde böyle bir bilgi yoktur.
2. `clubs.joinClub` invalidasyonu **koşulludur** — yalnızca üyelik `approved`
   düşerse (açık kulüp politikası). Middleware iş sonucunu göremez.
3. `auth` katalog invalidasyonu, per-user RBAC cache invalidasyonuyla **iç içedir**;
   rotaya taşımak birbirine bağlı iki işi iki dosyaya bölerdi.

Karar bilgisi iş bilgisidir; otomatikleştirilemez. **Otomatikleştirilebilen kısım,
kararın verilmemiş olduğunu yakalamaktır** → §4.

## 4. Kapsam denetimi

`uncoveredEntries()` + `tests/unit/cache-coverage.test.ts`: hiçbir efektin
düşürmediği bir girdi **kalıcı bayattır** (TTL dolana kadar). Yeni bir girdi
eklenip efekte bağlanmazsa test kırmızıya döner. `dashboard` orada **adı geçen**
bilinçli istisnadır (efektsiz, kısa TTL stratejisi) — sessizce atlanmaz.

## 5. Strateji seçimi

Her veri aynı stratejiyi istemez; bu bilinçli bir çeşitliliktir:

| Veri karakteri | Strateji | Örnek |
|---|---|---|
| Durağan + doğruluk kritik | Uzun TTL + **precise invalidasyon** (efekt) | `university` ağacı, `clubs` profili |
| Staleness-toleranslı sayaç | **Kısa TTL, efekt YOK** | `dashboard` (30 sn) |
| Viewer-bağımlı / cursor'lı | **Cache'lenmez** | feed, `listByClub`, aramalar |

## 6. Ölçüm

`/metrics` ucundan Prometheus'a giden seriler (bkz. [LOGLAMA.md](../LOGLAMA.md)
Grafana yığını):

| Seri | Etiketler | Ne söyler |
|---|---|---|
| `uniclub_cache_operations_total` | `namespace`, `result=hit\|miss\|error` | Hit oranı; `error` = Redis arıza sinyali |
| `uniclub_cache_operation_duration_seconds` | `namespace`, `operation=get\|set\|delete` | Bir Redis turunun gerçek maliyeti |

`error`'ın ayrı sayılması kritiktir: fail-open sayesinde Redis düştüğünde istekler
**düşmez**, yani başka hiçbir sinyal üretmez. Bu sayaç o sessiz arızanın tek sesidir.

**Etiket namespace'tir, anahtar DEĞİLDİR** — anahtar etiketlenseydi her ID yeni bir
zaman serisi üretir ve Prometheus şişerdi.

Hangi gözlemin hangi eylemi gerektirdiği → [yol haritası](01-yol-haritasi.md#artık-ölçebildiğimiz-için-sorulacak-sorular).

## 7. Bilinen tuzaklar

- **Cache'lenen veride `__d` alan adı kullanmayın.** `richCodec` `Date`'leri bu
  tek anahtarlı işaretçiyle sarmalar; aynı şekle sahip gerçek bir nesne decode'da
  `Date` sanılır. Drizzle satırlarında pratikte imkânsız, ama kural yazılı olsun.
- **Şekil değişikliği sessizdir.** Bir repository sorgusuna kolon eklenirse eski
  cache girdisi geçerli JSON olarak decode edilir ama eksik alanlıdır. Çözüm hazır:
  o keyspace'in `version`'ını artırın (`defineKeyspace(..., { version: 2 })`).
- **Instance'lar arası yarış hâlâ açık** (yazma A'da, okuma B'de) → yol haritası #5.
- **`bun run test` DB'yi sıfırlamaz** → `bun run test:all` kullanın.
