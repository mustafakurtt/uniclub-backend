import type { CacheStore } from "./cache.store";
import { richCodec, type Codec } from "./codec";
import { noopCacheMetrics, type CacheMetrics, type CacheOperation } from "./cache.metrics";
import type { Logger } from "../logger/logger";

export interface CacheOptions {
  /** Alttaki depolama adaptörü (memory / redis / null). */
  store: CacheStore;
  /** Serialization stratejisi. Varsayılan `richCodec` (Date'i korur). */
  codec?: Codec;
  /** Anahtar öneki (namespace). Genelde `namespace()` ile kurulur. */
  prefix?: string;
  /** `ttlSeconds` verilmeyen yazımlarda kullanılacak varsayılan TTL (saniye). */
  defaultTtlSeconds?: number;
  /** Verilirse decode hataları buraya yazılır (dev-facing, İngilizce). */
  logger?: Logger;
  /** Ölçüm dikişi. Verilmezse no-op (bkz. cache.metrics.ts). */
  metrics?: CacheMetrics;
}

export interface WriteOptions {
  /** Bu yazıma özel TTL (saniye). Verilmezse `defaultTtlSeconds`. */
  ttlSeconds?: number;
}

/**
 * Tipli cache facade. Bir `CacheStore` (depolama) + `Codec` (serialization) üzerine
 * ergonomik, storage-agnostik bir katman kurar. Feature'lar doğrudan store/redis'e
 * değil, bir `Cache` (genelde namespace'li) örneğine bağımlıdır (DIP).
 *
 * Öne çıkan yetenek `getOrSet` (read-through) + SINGLE-FLIGHT: aynı anahtar için
 * eşzamanlı miss'lerde loader yalnızca BİR kez çalışır (cache stampede koruması) —
 * ani trafik dalgasında DB'yi tek sorguya indirger.
 *
 * Not: single-flight süreç-yereldir (aynı instance içindeki eşzamanlı çağrılar).
 * Instance'lar arası koordinasyon amaçlanmaz; paylaşımlı sonuç zaten cache'e yazılır.
 *
 * DAYANIKLILIK (fail-open): cache bir OPTİMİZASYONDUR, doğruluk kaynağı değil. Store
 * I/O hatası (ör. Redis anlık kopması) OKUMADA miss'e düşer (kaynağa gidilir) ve
 * getOrSet'in İÇ YAZIMINDA yutulur (değer zaten hesaplandı) — böylece bir Redis
 * takılması isteği düşürmez (rate-limit ile aynı fail-open ilkesi). İSTİSNA: açık
 * `delete` (invalidasyon) hatayı YUTMAZ, çağırana yükseltir — bir invalidasyonu
 * sessizce kaçırmak bayat/yanlış yetki gibi doğruluk hatalarına yol açardı.
 */
export class Cache {
  private readonly store: CacheStore;
  private readonly codec: Codec;
  private readonly prefix: string;
  private readonly defaultTtlSeconds?: number;
  private readonly logger?: Logger;
  private readonly metrics: CacheMetrics;
  /** Metrik etiketi: namespace'siz kök örnek için "root" (boş etiket yerine). */
  private readonly label: string;
  /** Uçuştaki yüklemeler (tam anahtar → promise). Çocuk namespace'lerle PAYLAŞILIR. */
  private readonly inFlight: Map<string, Promise<unknown>>;
  /**
   * Süren `getOrSet` çağrıları (tam anahtar → sayaç). `inFlight`ten AYRIDIR ve
   * daha erken kurulur: getOrSet'in İLK await'inden önce, senkron olarak işaretlenir.
   * Aksi halde cache okumasıyla yükleme kaydı arasındaki mikro-görev boşluğunda
   * gelen bir invalidasyon görülmezdi. Sayaçtır çünkü aynı anahtarı bekleyen
   * eşzamanlı çağrılar tek yüklemeye bağlanır; en son çıkan temizler.
   */
  private readonly loading: Map<string, number>;
  /** Yüklemesi SÜRERKEN invalide edilmiş anahtarlar (bkz. getOrSet'teki yarış notu). */
  private readonly invalidatedWhileLoading: Set<string>;

  constructor(
    options: CacheOptions,
    shared?: {
      inFlight: Map<string, Promise<unknown>>;
      loading: Map<string, number>;
      invalidatedWhileLoading: Set<string>;
    }
  ) {
    this.store = options.store;
    this.codec = options.codec ?? richCodec;
    this.prefix = options.prefix ?? "";
    this.defaultTtlSeconds = options.defaultTtlSeconds;
    this.logger = options.logger;
    this.metrics = options.metrics ?? noopCacheMetrics;
    // Kardinalite: etiket keyspace ÖNEKİ, anahtar değil. Zincirli namespace'lerde
    // en dıştaki segment yeter ("university:faculties" değil "university").
    this.label = this.prefix ? this.prefix.split(":")[0] : "root";
    // Kök örnek yeni bir harita kurar; çocuklar kökünkini paylaşır ki aynı TAM
    // anahtar farklı namespace nesnelerinden çağrılsa bile tek yükleme olsun.
    this.inFlight = shared?.inFlight ?? new Map();
    this.loading = shared?.loading ?? new Map();
    this.invalidatedWhileLoading = shared?.invalidatedWhileLoading ?? new Set();
  }

  /**
   * Anahtar önekli çocuk cache. Aynı store/codec/logger'ı ve single-flight
   * haritasını paylaşır; yalnızca anahtar uzayı `prefix:` ile izole olur.
   * Zincirlenebilir: `cache.namespace("university").namespace("faculties")`.
   */
  namespace(prefix: string): Cache {
    return new Cache(
      {
        store: this.store,
        codec: this.codec,
        prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
        defaultTtlSeconds: this.defaultTtlSeconds,
        logger: this.logger,
        metrics: this.metrics,
      },
      {
        inFlight: this.inFlight,
        loading: this.loading,
        invalidatedWhileLoading: this.invalidatedWhileLoading,
      }
    );
  }

  /** Cache'ten tipli değer; yoksa/bozuksa/store hatasında `null` (miss). */
  async get<T>(key: string): Promise<T | null> {
    // getOrSet ile AYNI yoldan geçer → hit/miss/error sayımı tek yerde kalır.
    const result = await this.tryGetRaw<T>(this.k(key));
    return result === MISS ? null : result;
  }

  async set<T>(key: string, value: T, options?: WriteOptions): Promise<void> {
    const ttl = options?.ttlSeconds ?? this.defaultTtlSeconds;
    await this.timed("set", () => this.store.set(this.k(key), this.codec.encode(value), ttl));
  }

  /** Bir veya birden çok anahtarı geçersiz kılar. */
  async delete(key: string | string[]): Promise<void> {
    const keys = (Array.isArray(key) ? key : [key]).map((k) => this.k(k));
    // Silme, süren bir yüklemeyle yarışıyorsa işaretle: o yükleme sonucunu artık
    // cache'e YAZMAMALI (bkz. getOrSet'teki yarış notu).
    for (const fullKey of keys) {
      if (this.loading.has(fullKey)) this.invalidatedWhileLoading.add(fullKey);
    }
    await this.timed("delete", () => this.store.delete(keys));
  }

  /**
   * Read-through: cache'te varsa döner; yoksa `loader` ile hesaplar, cache'ler ve
   * döner. Eşzamanlı miss'lerde single-flight sayesinde loader tek kez koşar.
   *
   * loader `null`/`undefined` dönerse CACHE'LENMEZ (negatif cache'ten kaçınma):
   * "bulunamadı" durumları invalidasyonla temizlenemeyeceği için kalıcı yanlış
   * sonuç riski taşır — bu tür kontroller çağıran katmanda yapılmalı.
   *
   * YARIŞ KORUMASI (read-then-write): bir okuma miss'e düşüp DB'den yüklerken
   * araya bir YAZMA + invalidasyon girerse, invalidasyonun silecek bir şeyi yoktur
   * ve yükleme biter bitmez ESKİ değeri cache'e yazar — anahtar TTL boyunca bayat
   * kalır. Bunu engellemek için süren yüklemeler `inFlight`te izlenir; `delete`
   * çakışan bir anahtar görürse işaretler ve bu yükleme sonucunu cache'e YAZMAZ
   * (değeri yine de çağırana döndürür — o an DB'den okunmuş taze bir değerdir).
   *
   * KAPSAM: süreç-yerel. Yazma ile okumanın FARKLI instance'larda olduğu durumu
   * kapatmaz (bunun için anahtar versiyonlama ya da gecikmeli çift-silme gerekir);
   * orada bayatlık yine TTL ile sınırlıdır.
   */
  async getOrSet<T>(key: string, loader: () => Promise<T>, options?: WriteOptions): Promise<T> {
    const fullKey = this.k(key);
    // SENKRON işaretle: buradan sonraki HER invalidasyon görülebilir olmalı,
    // aşağıdaki ilk await'te kaçırılmamalı.
    this.beginLoad(fullKey);

    try {
      const cached = await this.tryGetRaw<T>(fullKey);
      if (cached !== MISS) return cached;

      // Uçuşta aynı anahtar varsa ona bağlan (stampede koruması).
      const pending = this.inFlight.get(fullKey);
      if (pending) return pending as Promise<T>;

      const promise = (async () => {
        const value = await loader();
        // Yükleme sürerken invalide edildiyse ESKİ değeri yazma (bkz. yarış notu).
        const invalidated = this.invalidatedWhileLoading.has(fullKey);
        if (value !== null && value !== undefined && !invalidated) {
          const ttl = options?.ttlSeconds ?? this.defaultTtlSeconds;
          try {
            await this.timed("set", () => this.store.set(fullKey, this.codec.encode(value), ttl));
          } catch (err) {
            // Yazma best-effort: değer zaten hesaplandı; cache yazımı isteği düşürmesin.
            this.logger?.warn({ err, key: fullKey }, "cache write failed; returning loaded value");
          }
        }
        return value;
      })();

      this.inFlight.set(fullKey, promise);
      try {
        return await promise;
      } finally {
        this.inFlight.delete(fullKey);
      }
    } finally {
      this.endLoad(fullKey);
    }
  }

  // ── Yardımcılar ────────────────────────────────────────────────────────
  /** Süren yükleme sayacını artırır (yarış penceresinin BAŞI). */
  private beginLoad(fullKey: string): void {
    this.loading.set(fullKey, (this.loading.get(fullKey) ?? 0) + 1);
  }

  /**
   * Sayacı azaltır; sıfırlanınca anahtarın yarış işaretini de temizler — işaret
   * bir SONRAKİ yüklemeye sızmamalı (yoksa o da hiç cache'lenmezdi).
   */
  private endLoad(fullKey: string): void {
    const remaining = (this.loading.get(fullKey) ?? 1) - 1;
    if (remaining > 0) {
      this.loading.set(fullKey, remaining);
      return;
    }
    this.loading.delete(fullKey);
    this.invalidatedWhileLoading.delete(fullKey);
  }

  /** Ham anahtarı namespace önekiyle tam anahtara çevirir. */
  private k(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  /**
   * Tam anahtar üzerinden get + decode; miss'i sentinel ile ayırt eder (null da
   * geçerli değer olabilir). Okuma metriğini BURADA sayarız — `get` ve `getOrSet`
   * ikisi de buradan geçer, dolayısıyla sayım tek yerde ve tutarlı olur.
   */
  private async tryGetRaw<T>(fullKey: string): Promise<T | typeof MISS> {
    const read = await this.safeStoreGet(fullKey);
    if (read.raw === null) {
      // Hata AYRI sayılır; normal bir "yok" ile aynı kefeye konmamalı.
      this.metrics.onRead(this.label, read.errored ? "error" : "miss");
      return MISS;
    }
    const decoded = this.tryDecode<T>(fullKey, read.raw);
    // Bozuk değer de miss'tir (kaynağa gidilir), hit sayılmamalı.
    this.metrics.onRead(this.label, decoded === null ? "miss" : "hit");
    return decoded === null ? MISS : decoded;
  }

  /**
   * Store okuma sarmalayıcısı: I/O hatasını (ör. Redis kopması) YUTAR, loglar ve
   * `null` (miss) döner. Cache doğruluk kaynağı değildir — okuma hatasında kaynağa
   * düşülür, istek düşmez (fail-open). Bozuk-değer temizliği `tryDecode`'ta.
   *
   * Hata AYRI sayılır (`error`), çünkü fonksiyonel olarak miss gibi davranır ama
   * anlamı tamamen farklıdır: biri normal, diğeri arıza sinyalidir.
   */
  private async safeStoreGet(fullKey: string): Promise<StoreRead> {
    try {
      return { raw: await this.timed("get", () => this.store.get(fullKey)), errored: false };
    } catch (err) {
      this.logger?.warn({ err, key: fullKey }, "cache read failed; treating as miss");
      return { raw: null, errored: true };
    }
  }

  /**
   * Bir depolama işlemini süreriyle ölçer. Hata durumunda da süre kaydedilir
   * (timeout'lar en pahalı çağrılardır; ölçüm dışında bırakılırsa tablo yalancı
   * derecede iyi görünür), sonra hata çağırana yükseltilir.
   */
  private async timed<T>(operation: CacheOperation, run: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await run();
    } finally {
      this.metrics.onOperation(this.label, operation, (performance.now() - startedAt) / 1000);
    }
  }

  /**
   * Decode'u güvenli yapar: bozuk/format-değişmiş bir değer varsa (ör. codec
   * güncellemesi) bunu MISS gibi ele al, bozuk anahtarı sil ki tekrar hesaplansın.
   */
  private tryDecode<T>(fullKey: string, raw: string): T | null {
    try {
      return this.codec.decode<T>(raw);
    } catch (err) {
      this.logger?.warn({ err, key: fullKey }, "cache decode failed; treating as miss");
      // best-effort temizlik; hatayı yutup miss'e düşer.
      void this.store.delete([fullKey]).catch(() => {});
      return null;
    }
  }
}

/** getOrSet içinde "cache'te yok" ile "değeri null" ayrımı için özel sentinel. */
const MISS = Symbol("cache-miss");

/**
 * Store okumasının sonucu. `errored` bilgisi dönüş DEĞERİNDE taşınır, instance
 * alanında değil: aynı Cache örneği üzerinde eşzamanlı okumalar bir bayrağı
 * birbirinin altından çekerdi.
 */
interface StoreRead {
  raw: string | null;
  errored: boolean;
}
