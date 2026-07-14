# Loglama

Bu proje **yapılandırılmış (structured) loglama** kullanır: her log satırı düz metin
değil, aranabilir alanlara sahip bir JSON nesnesidir. Altyapı iki parçadan oluşur:

1. **Kod tarafı** — uygulamanın log ÜRETME katmanı (pino, proje-bağımsız `core/logger`).
2. **Log yığını** (opsiyonel) — logları TOPLAYIP arayan katman: **Vector → Loki → Grafana**.

---

## 1. Kod tarafı (her zaman aktif)

Uygulama loglarını [pino](https://getpino.io) ile üretir. Taşınabilir motor
`core/logger`'da, bu projeye özel kurulum `shared/logger/logger.ts`'de.

| Özellik | Nerede | Not |
|---|---|---|
| Kök logger | `shared/logger/logger.ts` | `app: "universityClub"` binding; seviye `NODE_ENV`'e göre (prod: info, dev: debug) |
| Seviye sabitleri | `core/logger/logger.ts` → `LogLevel` | Magic string yok; `LogLevel.Info` vb. |
| İstek logu | `middlewares/request-logger.middleware.ts` | Her istek tek satır: `requestId, method, path, status, durationMs` |
| Kimlik/tenant zenginleştirme | aynı dosya, `getExtraFields` | Kimlikli isteklerde `userId` + `universityId` |
| Hassas alan maskeleme | `shared/logger/logger.ts` → `REDACT_PATHS` | `password`, `token`, `authorization`… → `[Redacted]` |
| Hata korelasyonu | `hono/request-id` + `error.middleware.ts` | İstemciye dönen `requestId` sunucu loguyla eşleşir |

**Modül logger'ı türetme** — asla `console.log` kullanma:

```ts
import { logger } from "../shared/logger/logger";
const log = logger.child({ module: "clubs" });

log.info({ clubId }, "kulüp oluşturuldu");
log.error({ err }, "beklenmeyen hata"); // `err` otomatik serialize edilir (stack dahil)
```

### `LOG_FILE` — çıktının dosyaya da yazılması

`LOG_FILE` verilirse loglar stdout'a **ek olarak** o dosyaya da ham JSON yazılır
(bir log-toplayıcı ajanı tail'lesin diye). Verilmezse yalnızca stdout — konteyner/
12-factor varsayılanı. Bkz. `config/env.ts`, `shared/logger/logger.ts`.

```sh
LOG_FILE=./logs/app.log   # .env'de zaten aktif; yığın bunu okur
```

---

## 2. Log yığını (Vector → Loki → Grafana)

Neden bu üçlü:

- **Vector** (ajan) — Rust ile yazılmış, yüksek performanslı, **vendor-bağımsız** log
  shipper. Log dosyasını okur, JSON'ı parse eder, Loki'ye yollar. Yarın backend'i
  değiştirsen (Elasticsearch, S3, bir SaaS…) **uygulama koduna dokunmadan** yalnızca
  Vector'ın sink'i değişir.
- **Loki** (depo) — hafif, **etiket-indeksli** log veritabanı (ELK'in ağır full-text
  yaklaşımının aksine). Bu ölçek için ideal.
- **Grafana** (arayüz) — LogQL ile arama + grafik.

```
[Bun app | host]        [Vector | container]     [Loki]        [Grafana]
  ./logs/app.log  ──────►  oku + JSON parse  ────► sakla ──────► ara + grafik
  (LOG_FILE)              + seviye/etiket        (:3100)         (:3001)
```

> **Neden dosya üzerinden?** Uygulama geliştirmede container'da değil, host'ta
> (`bun run dev`) çalışır — Vector onun stdout'unu doğrudan göremez. Bu yüzden
> `LOG_FILE` ile yazılan dosyayı okur. Uygulama prod'da container'a taşınırsa
> Vector'ın kaynağı `docker_logs`'a çevrilir; Loki/Grafana aynı kalır.

### Çalıştırma

Log yığını diğer servislerle **birlikte** gelir — ayrı bir komut/profil gerekmez.

```sh
# 1) Tüm altyapı + log yığını tek komutta
docker compose up -d
#    (yalnızca çekirdek istersen: docker compose up -d postgres redis mailpit)

# 2) Uygulama (LOG_FILE .env'de zaten ./logs/app.log)
bun run dev

# 3) Birkaç istek at, sonra Grafana'yı aç:
#    http://localhost:3001   (anonim Admin erişimi açık — login yok)
```

Grafana'da: sol menü **→ Explore →** veri kaynağı **Loki** (varsayılan olarak
provision edilmiştir) → aşağıdaki LogQL sorgularını dene.

### Örnek LogQL sorguları

```logql
# Tüm uygulama logları
{app="universityClub"}

# Yalnızca HTTP istek logları
{app="universityClub", module="http"}

# Yalnızca hatalar
{app="universityClub", level="error"}

# Belirli bir kullanıcının istekleri (userId etiket DEĞİL, gövdede — json ile süz)
{app="universityClub"} | json | userId="u-9"

# 500 dönen istekler + yavaşlar (durationMs > 1000)
{app="universityClub", module="http"} | json | status>=500

# Bir requestId'yi uçtan uca izle
{app="universityClub"} | json | requestId="r3"
```

> **Etiket kardinalitesi:** Loki'de yalnızca `app`, `module`, `level` etikettir
> (düşük kardinalite). `requestId`/`userId` gibi yüksek-kardinalite alanlar bilerek
> etiket YAPILMAZ — log gövdesinde kalır ve `| json | alan="..."` ile aranır.
> (Bunları etiket yapmak Loki'yi çökertir.) Bkz. `deploy/logging/vector.yaml`.

### Durdurma

```sh
docker compose down          # tüm servisleri durdur (veriler volume'da kalır)
docker compose down -v       # + tüm volume verilerini (log dahil) sil
```

---

## Yapılandırma dosyaları

| Dosya | İşi |
|---|---|
| `docker-compose.yml` | loki + vector + grafana servisleri (diğerleriyle birlikte kalkar) |
| `deploy/logging/vector.yaml` | dosya kaynağı → JSON parse + seviye/etiket → Loki sink |
| `deploy/logging/grafana/provisioning/datasources/loki.yml` | Grafana'ya Loki'yi otomatik tanıt |

---

## Prod notu

Kod tarafında yapılacak bir şey yoktur — çıktı zaten aggregator-dostu JSON. Prod'da:

- **Uygulama container'da stdout'a yazıyorsa** (önerilen, 12-factor): logları platform
  (Docker/k8s log driver) toplar; Vector'ın kaynağını `docker_logs`'a çevir ya da
  platformun kendi ajanını kullan.
- **Dosya tabanlı istiyorsan:** `LOG_FILE`'ı bir kalıcı yola ver, ajanı o dosyaya bağla.
- **Yönetilen bir SaaS'a** (Datadog, Grafana Cloud, Elastic…) geçmek yalnızca Vector'ın
  sink'ini değiştirmektir — yine uygulama kodu sabit.

---

## Sorun giderme

| Belirti | Bakılacak yer |
|---|---|
| Grafana'da log yok | `docker logs uniclub_vector` — parse/sink hatası? `./logs/app.log` oluşmuş mu (`LOG_FILE` set + `bun run dev` çalıştı mı)? |
| Vector sürekli restart | `docker logs uniclub_vector` — `vector.yaml` VRL sözdizim hatası |
| Loki 503 | Loki açılırken normaldir; Vector otomatik yeniden dener. Kalıcıysa `docker logs uniclub_loki` |
| Loki'de doğrudan sorgu | `curl -sG http://localhost:3100/loki/api/v1/query_range --data-urlencode 'query={app="universityClub"}'` |
