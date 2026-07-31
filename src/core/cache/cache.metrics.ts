/**
 * Cache ölçüm DİKİŞİ (seam). core/ proje-bağımsız kalmalı: burada yalnızca
 * ARAYÜZ tanımlanır, Prometheus/prom-client bilinmez. Proje kendi kurulumunda
 * (`shared/cache/cache.client.ts`) bu arayüzü kendi registry'sine bağlar —
 * aynı desen: `createLogger`, `createMetrics`, `setGuardAuditSink`.
 *
 * KARDİNALİTE UYARISI: `namespace` etiketi keyspace önekidir (ör. "university"),
 * ANAHTAR DEĞİLDİR. Anahtar etiketlenirse her ID yeni bir zaman serisi üretir ve
 * Prometheus şişer (aynı uyarı core/metrics'teki `route` etiketinde de var).
 */

/** Bir cache okumasının sonucu. */
export type CacheReadResult = "hit" | "miss" | "error";

/** Ölçülen depolama işlemi. */
export type CacheOperation = "get" | "set" | "delete";

export interface CacheMetrics {
  /**
   * Bir okuma tamamlandı. `hit`: cache'ten servis edildi. `miss`: kaynağa gidildi
   * (yok, süresi dolmuş ya da bozuk değer). `error`: store I/O hatası — fail-open
   * ile miss gibi ele alındı ama AYRI sayılır, çünkü bu bir arıza sinyalidir.
   */
  onRead(namespace: string, result: CacheReadResult): void;

  /** Bir depolama işleminin süresi (saniye). Hata durumunda da çağrılır. */
  onOperation(namespace: string, operation: CacheOperation, durationSeconds: number): void;
}

/** Ölçüm kurulmadığında kullanılan sıfır-maliyetli no-op. */
export const noopCacheMetrics: CacheMetrics = {
  onRead: () => {},
  onOperation: () => {},
};
