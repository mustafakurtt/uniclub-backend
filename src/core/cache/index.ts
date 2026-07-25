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
export { jsonCodec, type Codec } from "./codec";

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
} from "./keyspace";
export { invalidates, fromParams, type InvalidatesOptions } from "./invalidates";

export { InMemoryCacheStore, type InMemoryCacheStoreOptions } from "./stores/memory.store";
export { RedisCacheStore, type RedisCacheClient } from "./stores/redis.store";
export { NullCacheStore } from "./stores/null.store";
