import { LocalDiskStorage, InMemoryStorage, type StorageStore } from "../../core/storage";
import { env } from "../../config/env";

/**
 * Uygulamanın paylaşılan nesne-depolama örneği — proje-bağımsız core/storage
 * adaptörlerinin bu projeye özel kurulumu (sürücü env'den). Aynı desen:
 * shared/cache/cache.client.ts, shared/redis/redis.client.ts.
 *
 * Feature'lar (media) somut adaptöre değil bu `storage`'a (StorageStore) bağımlıdır.
 */
function buildStore(): StorageStore {
  switch (env.STORAGE_DRIVER) {
    case "memory":
      return new InMemoryStorage();
    case "local":
    default:
      return new LocalDiskStorage(env.UPLOAD_DIR);
  }
}

export const storage: StorageStore = buildStore();
