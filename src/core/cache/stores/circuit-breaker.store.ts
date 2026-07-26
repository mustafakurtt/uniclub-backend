import type { CacheStore } from "../cache.store";
import type { Logger } from "../../logger/logger";

/**
 * DEVRE KESİCİ (circuit breaker) — herhangi bir `CacheStore`'u saran dekoratör.
 *
 * Çözdüğü sorun: `Cache` zaten fail-open'dır, yani Redis düştüğünde istekler
 * DÜŞMEZ (okuma miss'e düşer, kaynağa gidilir). Ama her okuma yine de bağlantıyı
 * DENER ve timeout'u BEKLER. Yani cache arızası sessizce bir **gecikme arızasına**
 * dönüşür — hem de cache'in tam yardım etmesi gereken anda, çünkü artık her istek
 * hem timeout hem DB sorgusu ödüyor. Devre kesici o beklemeyi ortadan kaldırır.
 *
 * ÖNEMLİ TASARIM KARARI: devre AÇIKKEN işlemler **hata fırlatır**, sessizce
 * "boş sonuç" dönmez. Sebep: sessiz dönseydi `Cache` bunu normal bir `miss` gibi
 * sayardı ve arıza METRİKLERDE GÖRÜNMEZ olurdu — oysa fail-open yüzünden istekler
 * düşmediği için `result="error"` sayacı bu arızanın TEK sinyalidir. Devre
 * kesicinin kazancı hatayı gizlemek değil, hatayı ANINDA vermektir (timeout yok).
 * Aşağıdaki katmanlar davranışlarını değiştirmez: okuma miss'e düşer, `getOrSet`
 * yazımı yutulur, `delete` çağırana yükselir.
 *
 * Durumlar:
 *   CLOSED    → geçirgen. Ardışık hata sayılır.
 *   OPEN      → `failureThreshold` ardışık hatadan sonra; `openDurationMs` boyunca
 *               alttaki store'a HİÇ dokunulmaz, işlemler anında hata verir.
 *   HALF_OPEN → süre dolunca TEK bir yoklama isteği geçirilir. Başarılı → CLOSED
 *               (sayaç sıfırlanır), başarısız → yeniden OPEN (süre yeniden başlar).
 *               Yoklama uçarken gelen diğer istekler anında hata alır — kapalı bir
 *               Redis'e aynı anda yüzlerce yoklama gitmesin.
 */
export class CircuitOpenError extends Error {
  constructor(operation: string) {
    super(`cache circuit is open; skipped ${operation} without contacting the store`);
    this.name = "CircuitOpenError";
  }
}

type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerCacheStoreOptions {
  /** Devreyi açan ardışık hata sayısı. Varsayılan 5. */
  failureThreshold?: number;
  /** Devrenin açık kalacağı süre (ms); sonunda tek yoklama denenir. Varsayılan 5000. */
  openDurationMs?: number;
  /** Durum değişimleri buraya yazılır (dev-facing, İngilizce). */
  logger?: Logger;
  /** Durum değişiminde çağrılır — projeler bunu metriğe bağlayabilir. */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** Zaman kaynağı (test dikişi). Varsayılan `Date.now`. */
  now?: () => number;
}

export class CircuitBreakerCacheStore implements CacheStore {
  private readonly inner: CacheStore;
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private readonly logger?: Logger;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;
  private readonly now: () => number;

  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  /** OPEN durumunun bitiş anı (epoch ms). */
  private openUntil = 0;
  /** HALF_OPEN'da bir yoklama uçuyor mu? (aynı anda yalnızca bir tane olmalı) */
  private probeInFlight = false;

  constructor(inner: CacheStore, options: CircuitBreakerCacheStoreOptions = {}) {
    this.inner = inner;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.openDurationMs = options.openDurationMs ?? 5000;
    this.logger = options.logger;
    this.onStateChange = options.onStateChange;
    this.now = options.now ?? Date.now;
  }

  get(key: string): Promise<string | null> {
    return this.run("get", () => this.inner.get(key));
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    return this.run("set", () => this.inner.set(key, value, ttlSeconds));
  }

  delete(keys: string[]): Promise<void> {
    // Boş silme I/O gerektirmez; devre açıkken bile gereksiz yere hata vermesin.
    if (keys.length === 0) return Promise.resolve();
    return this.run("delete", () => this.inner.delete(keys));
  }

  /** Teşhis/test için anlık durum. */
  get circuitState(): CircuitState {
    return this.state;
  }

  private async run<T>(operation: string, call: () => Promise<T>): Promise<T> {
    if (!this.allowRequest()) {
      throw new CircuitOpenError(operation);
    }

    const wasProbe = this.state === "half-open";
    try {
      const result = await call();
      this.onSuccess(wasProbe);
      return result;
    } catch (err) {
      this.onFailure(wasProbe);
      throw err;
    }
  }

  /**
   * İsteğin alttaki store'a ulaşmasına izin var mı? Yan etkilidir: OPEN süresi
   * dolduysa burada HALF_OPEN'a geçilir ve yoklama hakkı BU çağrıya verilir.
   */
  private allowRequest(): boolean {
    if (this.state === "closed") return true;

    if (this.state === "open") {
      if (this.now() < this.openUntil) return false;
      this.transition("half-open");
      this.probeInFlight = true;
      return true; // yoklama hakkı bu çağrının
    }

    // half-open: yoklama zaten uçuyorsa diğerleri beklemeden reddedilir.
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  private onSuccess(wasProbe: boolean): void {
    if (wasProbe) this.probeInFlight = false;
    this.consecutiveFailures = 0;
    if (this.state !== "closed") this.transition("closed");
  }

  private onFailure(wasProbe: boolean): void {
    if (wasProbe) this.probeInFlight = false;

    // Yoklama başarısız → doğrudan yeniden OPEN (eşiği yeniden beklemeye gerek yok).
    if (wasProbe) {
      this.open();
      return;
    }

    this.consecutiveFailures++;
    if (this.state === "closed" && this.consecutiveFailures >= this.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.openUntil = this.now() + this.openDurationMs;
    this.transition("open");
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;

    // Durum değişimi nadir ve önemlidir → log gürültüsü yaratmaz, aksine arızanın
    // başlangıç/bitiş anını tam olarak işaretler.
    const level = to === "closed" ? "info" : "warn";
    this.logger?.[level](
      { from, to, consecutiveFailures: this.consecutiveFailures },
      "cache circuit breaker state changed"
    );
    this.onStateChange?.(from, to);
  }
}
