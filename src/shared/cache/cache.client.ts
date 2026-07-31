import {
  Cache,
  CircuitBreakerCacheStore,
  InMemoryCacheStore,
  NullCacheStore,
  RedisCacheStore,
  TimeoutCacheStore,
  type CacheMetrics,
  type CacheStore,
} from "../../core/cache";
import { Counter, Histogram } from "../../core/metrics/metrics";
import { env } from "../../config/env";
import { redis } from "../redis/redis.client";
import { logger } from "../logger/logger";
import { metrics as appMetrics } from "../metrics/metrics";

/**
 * Uygulamanın paylaşılan cache örneği — proje-bağımsız core/cache facade'ının bu
 * projeye özel kurulumu (sürücü env'den, Redis mevcut paylaşımlı bağlantıdan,
 * hata bu projenin logger'ına, ölçüm bu projenin Prometheus registry'sine).
 * Aynı desen: shared/redis/redis.client.ts, shared/metrics/metrics.ts.
 *
 * Feature'lar doğrudan bir store'a değil, bu `cache`'in namespace'li çocuğuna
 * bağımlıdır — bkz. features/university/university.cache.ts.
 */
/**
 * Dayanıklılık dekoratörleri YALNIZCA Redis sürücüsüne takılır: bellek/null
 * adaptörleri ağ üzerinden konuşmadığı için ne başarısız olur ne bekletir.
 *
 * SIRA ÖNEMLİ — CircuitBreaker( Timeout( Redis ) ):
 * ioredis bağlantı koptuğunda komutu kuyruğa alıp yeniden dener, yani çağrı hata
 * VERMEZ, ASILI KALIR (bu projede ölçüldü: Redis durunca tek okuma **~43 sn**).
 * Devre kesici yalnızca dönmüş hataları sayabildiği için tek başına tripleyemezdi.
 * İçteki timeout asılı çağrıyı hızlı bir hataya çevirir; dıştaki devre kesici o
 * hataları sayıp eşiği geçince artık hiç denemez. Sonuç: arızanın ilk 5 isteği
 * 200'er ms öder, sonrası sıfır — 43 sn yerine.
 */
function buildStore(): CacheStore {
  switch (env.CACHE_DRIVER) {
    case "memory":
      return new InMemoryCacheStore();
    case "null":
      return new NullCacheStore();
    case "redis":
    default:
      return new CircuitBreakerCacheStore(
        new TimeoutCacheStore(new RedisCacheStore(redis), {
          timeoutMs: 200,
          logger: logger.child({ module: "cache.timeout" }),
        }),
        {
          // 5 ardışık hata gerçek bir arızadır (tek seferlik takılma değil); 5 sn
          // sonra tek yoklamayla toparlanma denenir — Redis geri geldiğinde cache
          // en geç 5 sn içinde yeniden devreye girer.
          failureThreshold: 5,
          openDurationMs: 5_000,
          logger: logger.child({ module: "cache.circuit" }),
          onStateChange: (from, to) => cacheBreakerTransitions.inc({ from, to }),
        }
      );
  }
}

/**
 * core/cache'in ölçüm dikişinin prom-client karşılığı. Seriler uygulamanın MEVCUT
 * registry'sine yazılır, yani `/metrics` ucundan Prometheus'a birlikte gider
 * (bkz. docs/LOGLAMA.md'deki Grafana yığını).
 *
 * KARDİNALİTE: `namespace` etiketi keyspace önekidir ("university", "clubs"…) —
 * sayısı sabit ve küçüktür. Anahtar ASLA etiketlenmez (her ID yeni seri demekti).
 *
 * Ne sorusuna cevap verir: hit oranı (cache işe yarıyor mu?), `error` sayacı
 * (Redis sağlıklı mı? — fail-open sayesinde istek düşmediği için TEK sinyal budur),
 * süre histogramı (Redis turu ne kadar pahalı, katmanlı cache'e değer mi?).
 */
const cacheOperations = new Counter({
  name: "uniclub_cache_operations_total",
  help: "Cache okuma sonuçları (hit / miss / error)",
  labelNames: ["namespace", "result"] as const,
  registers: [appMetrics.registry],
});

const cacheDuration = new Histogram({
  name: "uniclub_cache_operation_duration_seconds",
  help: "Cache depolama işlemi süresi (saniye)",
  labelNames: ["namespace", "operation"] as const,
  // Cache turları milisaniye ölçeğindedir; HTTP bucket'ları burada çok kaba kalır.
  buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5],
  registers: [appMetrics.registry],
});

/**
 * Devre kesici durum geçişleri. `closed→open` alarma bağlanacak seridir: cache
 * tamamen devre dışı kaldı ve her istek DB'ye iniyor demektir.
 */
const cacheBreakerTransitions = new Counter({
  name: "uniclub_cache_breaker_transitions_total",
  help: "Cache devre kesici durum geçişleri",
  labelNames: ["from", "to"] as const,
  registers: [appMetrics.registry],
});

const cacheMetrics: CacheMetrics = {
  onRead: (namespace, result) => cacheOperations.inc({ namespace, result }),
  onOperation: (namespace, operation, durationSeconds) =>
    cacheDuration.observe({ namespace, operation }, durationSeconds),
};

export const cache = new Cache({
  store: buildStore(),
  defaultTtlSeconds: env.CACHE_DEFAULT_TTL,
  logger: logger.child({ module: "cache" }),
  metrics: cacheMetrics,
});
