# perf/ — Yük ve performans ölçüm araçları

Bu klasör **CI'da koşmaz** ve `tests/`ten ayrıdır: `tests/` doğruluğu sınar,
burası kapasiteyi ölçer. Ölçüm sonuçları ve çıkarımlar →
[docs/PERFORMANS.md](../docs/PERFORMANS.md).

| Dosya | İş |
|---|---|
| `load.ts` | Yük üreteci: eşzamanlı worker'lar, ısınma, yüzdelik hesabı, tablo çıktısı |
| `run.ts` | HTTP senaryoları (uçtan uca, gerçek sunucuya) |
| `backend.ts` | Ham arka uç kapasitesi — Redis GET vs Postgres SELECT |
| `micro.ts` | Codec ve store dekoratörlerinin mikro-maliyeti |

## Neden ayrı süreç?

Sunucu **ayrı bir süreçte** koşar ve gerçek HTTP üzerinden vurulur. `app.request()`
ile ölçmek çok daha kolay olurdu ama HTTP sunucusunu, soket katmanını ve gerçek
eşzamanlılığı atlardı — "sunucudaymış gibi" olmazdı.

## Kullanım

```sh
# Sunucu (ayrı terminal), prod modunda:
NODE_ENV=production LOG_LEVEL=error RATE_LIMIT_DISABLED=true PORT=3100 bun run src/index.ts

# Yük:
bun run perf                                    # varsayılan: 50 eşzamanlı, 8 sn
PERF_CONNECTIONS=1,50,200 PERF_DURATION=6 bun run perf   # süpürme
PERF_BASE_URL=https://... bun run perf          # uzak sunucu

# Arka uç ve mikro ölçümler:
bun run perf/backend.ts
bun run perf/micro.ts
```

`RATE_LIMIT_DISABLED=true` şart: aksi halde ölçtüğünüz şey sistem değil, hız
sınırlayıcı olur.

## Ölçerken dikkat

- **Isınmayı ölçmeyin.** `load.ts` ilk 2 sn'yi atar (JIT, bağlantı havuzu, cache dolumu).
- **Ortalamaya değil yüzdeliklere bakın.** Ortalama, kuyruk gecikmesini gizler.
- **Gövdeyi tüketin.** `load.ts` `res.arrayBuffer()` çağırır; okunmayan gövde
  bağlantıyı serbest bırakmaz ve ölçümü sessizce bozar.
- **SINGLE-FLIGHT TUZAĞI.** Tüm sanal kullanıcılar aynı anahtarı isterse
  `getOrSet` eşzamanlı miss'leri tek yüklemeye çökertir; cache'siz yapılandırma
  yapay olarak hızlı görünür. **Cache'li/cache'siz karşılaştırmayı eşzamanlılık
  1'de yapın.** (Bu tuzağa bir kez düşüldü, bkz. docs/PERFORMANS.md §2.)
- **Yük üreteci aynı makinede** CPU paylaşır → mutlak sayılar değil,
  karşılaştırmalar anlamlıdır.
