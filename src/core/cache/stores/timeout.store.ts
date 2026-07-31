import type { CacheStore } from "../cache.store";
import type { Logger } from "../../logger/logger";

/**
 * ZAMAN AŞIMI dekoratörü — bir `CacheStore` işleminin ne kadar sürebileceğini
 * sınırlar.
 *
 * NEDEN GEREKLİ (ölçülmüş gerçek): devre kesici tek başına YETMEZ. ioredis
 * varsayılan olarak bağlantı koptuğunda komutları kuyruğa alır ve yeniden dener
 * (`enableOfflineQueue` + `maxRetriesPerRequest`), yani çağrı HATA VERMEZ — ASILI
 * KALIR. Bu projede ölçüldü: Redis durdurulduğunda tek bir cache okuması
 * **~43 saniye** sürdü. Devre kesici yalnızca DÖNMÜŞ hataları sayabildiği için
 * bu senaryoda hiç tripleyemez; cache'in fail-open olması da işe yaramaz, çünkü
 * kaynağa düşmeden önce o 43 saniye zaten ödenmiştir.
 *
 * Bu yüzden sıra ÖNEMLİDİR: CircuitBreaker( Timeout( RedisStore ) ).
 * Timeout içeride durur ve asılı çağrıyı hızlı bir HATAYA çevirir; devre kesici
 * dışarıda o hataları sayar ve eşiği geçince artık hiç denemez. Sonuç: arızanın
 * ilk birkaç isteği `timeoutMs` öder, sonrası sıfır.
 *
 * NOT (iptal edilemezlik): `Promise.race` alttaki çağrıyı İPTAL ETMEZ — ioredis
 * komutu arka planda sürmeye devam eder, sonucu yok sayılır. Bu kaçınılmazdır
 * (komut zaten gönderilmiş olabilir); yapılabilecek şey isteği bekletmemektir.
 * Sahipsiz reddi (unhandled rejection) engellemek için sonuç yutulur.
 */
export class CacheTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`cache ${operation} timed out after ${timeoutMs}ms`);
    this.name = "CacheTimeoutError";
  }
}

export interface TimeoutCacheStoreOptions {
  /**
   * İşlem başına üst sınır (ms). Varsayılan 200 — sağlıklı bir Redis turu
   * milisaniye ölçeğindedir, 200 ms zaten "bir şeyler ters" demektir.
   */
  timeoutMs?: number;
  /** Zaman aşımları buraya yazılır (dev-facing, İngilizce). */
  logger?: Logger;
}

export class TimeoutCacheStore implements CacheStore {
  private readonly inner: CacheStore;
  private readonly timeoutMs: number;
  private readonly logger?: Logger;

  constructor(inner: CacheStore, options: TimeoutCacheStoreOptions = {}) {
    this.inner = inner;
    this.timeoutMs = options.timeoutMs ?? 200;
    this.logger = options.logger;
  }

  get(key: string): Promise<string | null> {
    return this.withTimeout("get", this.inner.get(key));
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    return this.withTimeout("set", this.inner.set(key, value, ttlSeconds));
  }

  delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return Promise.resolve();
    return this.withTimeout("delete", this.inner.delete(keys));
  }

  private withTimeout<T>(operation: string, pending: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        this.logger?.warn({ operation, timeoutMs: this.timeoutMs }, "cache operation timed out");
        reject(new CacheTimeoutError(operation, this.timeoutMs));
      }, this.timeoutMs);
    });

    // Yarışı kaybeden taraf sahipsiz kalmasın: geç gelen sonucu/hatayı yut.
    pending.catch(() => {});

    return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
  }
}
