import {
  Cache,
  InMemoryCacheStore,
  NullCacheStore,
  RedisCacheStore,
  type CacheStore,
} from "../../core/cache";
import { env } from "../../config/env";
import { redis } from "../redis/redis.client";
import { logger } from "../logger/logger";

/**
 * Uygulamanın paylaşılan cache örneği — proje-bağımsız core/cache facade'ının bu
 * projeye özel kurulumu (sürücü env'den, Redis mevcut paylaşımlı bağlantıdan,
 * hata bu projenin logger'ına). Aynı desen: shared/redis/redis.client.ts.
 *
 * Feature'lar doğrudan bir store'a değil, bu `cache`'in namespace'li çocuğuna
 * bağımlıdır — bkz. features/university/university.cache.ts.
 */
function buildStore(): CacheStore {
  switch (env.CACHE_DRIVER) {
    case "memory":
      return new InMemoryCacheStore();
    case "null":
      return new NullCacheStore();
    case "redis":
    default:
      return new RedisCacheStore(redis);
  }
}

export const cache = new Cache({
  store: buildStore(),
  defaultTtlSeconds: env.CACHE_DEFAULT_TTL,
  logger: logger.child({ module: "cache" }),
});
