/**
 * core/cache barrel — storage-agnostik, proje-bağımsız cache altyapısı.
 * Proje kurulumu (shared/cache) ve testler buradan tek noktadan import eder.
 *
 * Katmanlar: CacheStore (port) → adaptörler (memory/redis/null) → Cache (tipli
 * facade: getOrSet + single-flight + namespace) + Codec (serialization) →
 * Keyspace (tipli girdiler + efektler) → invalidates (rota middleware'i).
 */
export { Cache, type CacheOptions, type WriteOptions } from "./cache";
export type { CacheStore } from "./cache.store";
export { jsonCodec, richCodec, type Codec } from "./codec";
export {
  noopCacheMetrics,
  type CacheMetrics,
  type CacheOperation,
  type CacheReadResult,
} from "./cache.metrics";

export {
  defineKeyspace,
  entry,
  effect,
  dropEntries,
  uncoveredEntries,
  type CacheEntry,
  type CacheEffect,
  type DroppableEntry,
  type EntryFactory,
  type EntryOptions,
  type EntrySpec,
  type Keyspace,
  type KeyspaceOptions,
} from "./keyspace";
export { invalidates, fromParams, type InvalidatesOptions } from "./invalidates";

export { InMemoryCacheStore, type InMemoryCacheStoreOptions } from "./stores/memory.store";
export { RedisCacheStore, type RedisCacheClient } from "./stores/redis.store";
export { NullCacheStore } from "./stores/null.store";
export {
  CircuitBreakerCacheStore,
  CircuitOpenError,
  type CircuitBreakerCacheStoreOptions,
} from "./stores/circuit-breaker.store";
export {
  TimeoutCacheStore,
  CacheTimeoutError,
  type TimeoutCacheStoreOptions,
} from "./stores/timeout.store";
