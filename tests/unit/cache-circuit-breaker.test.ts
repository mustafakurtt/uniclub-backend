import { describe, expect, it } from "bun:test";
import {
  Cache,
  CircuitBreakerCacheStore,
  CircuitOpenError,
  InMemoryCacheStore,
  TimeoutCacheStore,
  CacheTimeoutError,
  type CacheStore,
} from "../../src/core/cache";
import { createLogger } from "../../src/core/logger/logger";

/**
 * Devre kesici birim testleri. Zaman ENJEKTE edilir (`now`), böylece "5 sn sonra"
 * senaryoları gerçekten beklemeden, deterministik olarak koşar.
 */

const silent = createLogger({ level: "silent" });

/** Ne zaman patlayacağı kontrol edilebilen, çağrıları sayan sahte store. */
function flakyStore() {
  let failing = false;
  let calls = 0;
  const inner = new InMemoryCacheStore();

  const store: CacheStore = {
    get: async (key) => {
      calls++;
      if (failing) throw new Error("redis down");
      return inner.get(key);
    },
    set: async (key, value, ttl) => {
      calls++;
      if (failing) throw new Error("redis down");
      return inner.set(key, value, ttl);
    },
    delete: async (keys) => {
      calls++;
      if (failing) throw new Error("redis down");
      return inner.delete(keys);
    },
  };

  return {
    store,
    fail: () => {
      failing = true;
    },
    recover: () => {
      failing = false;
    },
    get calls() {
      return calls;
    },
  };
}

/** Elle ilerletilebilen saat. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function build(options?: { threshold?: number; openMs?: number }) {
  const flaky = flakyStore();
  const time = clock();
  const breaker = new CircuitBreakerCacheStore(flaky.store, {
    failureThreshold: options?.threshold ?? 3,
    openDurationMs: options?.openMs ?? 5000,
    logger: silent,
    now: time.now,
  });
  return { flaky, time, breaker };
}

/** Eşiğe ulaşana kadar hata ürettirir (devreyi açar). */
async function trip(breaker: CircuitBreakerCacheStore, times = 3) {
  for (let i = 0; i < times; i++) {
    await breaker.get("k").catch(() => {});
  }
}

describe("CircuitBreakerCacheStore", () => {
  it("sağlıklıyken tamamen geçirgendir", async () => {
    const { breaker } = build();
    await breaker.set("k", "v");
    expect(await breaker.get("k")).toBe("v");
    expect(breaker.circuitState).toBe("closed");
  });

  it("ardışık N hatadan sonra devreyi açar", async () => {
    const { flaky, breaker } = build({ threshold: 3 });
    flaky.fail();

    await trip(breaker, 3);
    expect(breaker.circuitState).toBe("open");
  });

  it("AÇIKKEN alttaki store'a HİÇ dokunmaz (timeout beklemez)", async () => {
    const { flaky, breaker } = build({ threshold: 3 });
    flaky.fail();
    await trip(breaker, 3);

    const callsWhenOpened = flaky.calls;
    await expect(breaker.get("k")).rejects.toThrow(CircuitOpenError);
    await expect(breaker.set("k", "v")).rejects.toThrow(CircuitOpenError);
    await expect(breaker.delete(["k"])).rejects.toThrow(CircuitOpenError);

    // Asıl kazanç: üç çağrı da store'a gitmedi.
    expect(flaky.calls).toBe(callsWhenOpened);
  });

  it("AÇIKKEN sessizce başarı taklit ETMEZ — hata fırlatır (metrikte görünsün)", async () => {
    const { flaky, breaker } = build({ threshold: 3 });
    flaky.fail();
    await trip(breaker, 3);

    // Sessizce null dönseydi Cache bunu normal bir "miss" sayardı ve arıza
    // metriklerde kaybolurdu — fail-open yüzünden başka sinyal yok.
    await expect(breaker.get("k")).rejects.toThrow(CircuitOpenError);
  });

  it("araya giren başarı ardışık sayacı sıfırlar", async () => {
    const { flaky, breaker } = build({ threshold: 3 });

    flaky.fail();
    await breaker.get("k").catch(() => {});
    await breaker.get("k").catch(() => {});
    flaky.recover();
    await breaker.get("k"); // başarı → sayaç sıfır
    flaky.fail();
    await breaker.get("k").catch(() => {});
    await breaker.get("k").catch(() => {});

    expect(breaker.circuitState).toBe("closed"); // 2 + 2, ardışık 3 değil
  });

  it("süre dolunca tek yoklama geçirir; başarılıysa kapanır", async () => {
    const { flaky, time, breaker } = build({ threshold: 3, openMs: 5000 });
    flaky.fail();
    await trip(breaker, 3);
    expect(breaker.circuitState).toBe("open");

    time.advance(5001);
    flaky.recover();

    expect(await breaker.get("k")).toBeNull(); // yoklama geçti
    expect(breaker.circuitState).toBe("closed");
  });

  it("yoklama başarısızsa yeniden açılır ve süre BAŞTAN başlar", async () => {
    const { flaky, time, breaker } = build({ threshold: 3, openMs: 5000 });
    flaky.fail();
    await trip(breaker, 3);

    time.advance(5001);
    await breaker.get("k").catch(() => {}); // yoklama başarısız
    expect(breaker.circuitState).toBe("open");

    // Süre yeniden başladığı için hemen sonraki istek yine anında reddedilir.
    const callsBefore = flaky.calls;
    await expect(breaker.get("k")).rejects.toThrow(CircuitOpenError);
    expect(flaky.calls).toBe(callsBefore);
  });

  it("HALF_OPEN'da yalnızca TEK yoklama uçar (Redis'i yoklamayla boğmaz)", async () => {
    const { flaky, time, breaker } = build({ threshold: 3, openMs: 5000 });
    flaky.fail();
    await trip(breaker, 3);
    time.advance(5001);

    const callsBefore = flaky.calls;
    // Beşi aynı anda: yalnızca biri store'a ulaşmalı.
    await Promise.allSettled(Array.from({ length: 5 }, () => breaker.get("k")));

    expect(flaky.calls).toBe(callsBefore + 1);
  });

  it("boş delete devre açıkken bile hata vermez (I/O gerektirmiyor)", async () => {
    const { flaky, breaker } = build({ threshold: 3 });
    flaky.fail();
    await trip(breaker, 3);

    expect(breaker.delete([])).resolves.toBeUndefined();
  });

  it("durum değişimlerini bildirir (metriğe bağlanabilsin)", async () => {
    const flaky = flakyStore();
    const time = clock();
    const changes: string[] = [];
    const breaker = new CircuitBreakerCacheStore(flaky.store, {
      failureThreshold: 2,
      openDurationMs: 1000,
      logger: silent,
      now: time.now,
      onStateChange: (from, to) => changes.push(`${from}→${to}`),
    });

    flaky.fail();
    await trip(breaker, 2);
    time.advance(1001);
    flaky.recover();
    await breaker.get("k");

    expect(changes).toEqual(["closed→open", "open→half-open", "half-open→closed"]);
  });
});

describe("TimeoutCacheStore", () => {
  /** Verilen süre kadar asılı kalan store (ioredis'in kuyruk davranışını taklit eder). */
  const hangingStore = (hangMs: number): CacheStore => ({
    get: async () => {
      await Bun.sleep(hangMs);
      return "geç gelen";
    },
    set: async () => {
      await Bun.sleep(hangMs);
    },
    delete: async () => {
      await Bun.sleep(hangMs);
    },
  });

  it("sağlıklı çağrıya karışmaz", async () => {
    const store = new TimeoutCacheStore(new InMemoryCacheStore(), { timeoutMs: 100 });
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
  });

  it("asılı kalan çağrıyı süre dolunca hataya çevirir", async () => {
    const store = new TimeoutCacheStore(hangingStore(5000), { timeoutMs: 50, logger: silent });

    const startedAt = performance.now();
    await expect(store.get("k")).rejects.toThrow(CacheTimeoutError);
    // 5 sn beklemek yerine ~50 ms'de döndü.
    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  it("boş delete zaman aşımına uğramaz (I/O yok)", async () => {
    const store = new TimeoutCacheStore(hangingStore(5000), { timeoutMs: 20, logger: silent });
    expect(store.delete([])).resolves.toBeUndefined();
  });

  it("KOMPOZİSYON: Timeout içeride, CircuitBreaker dışarıda → asılı Redis devreyi açar", async () => {
    // Gerçek senaryonun aynısı: çağrılar hata VERMİYOR, asılı kalıyor. Devre
    // kesici tek başına bunu göremezdi; timeout onu sayılabilir hataya çevirir.
    const breaker = new CircuitBreakerCacheStore(
      new TimeoutCacheStore(hangingStore(10_000), { timeoutMs: 20, logger: silent }),
      { failureThreshold: 3, openDurationMs: 5000, logger: silent }
    );

    for (let i = 0; i < 3; i++) await breaker.get("k").catch(() => {});
    expect(breaker.circuitState).toBe("open");

    // Devre açıldıktan sonra artık 20 ms bile ödenmiyor.
    const startedAt = performance.now();
    await expect(breaker.get("k")).rejects.toThrow(CircuitOpenError);
    expect(performance.now() - startedAt).toBeLessThan(10);
  });
});

describe("devre kesici + Cache birlikte", () => {
  it("devre açıkken istek DÜŞMEZ: okuma miss'e düşer, kaynağa gidilir", async () => {
    const flaky = flakyStore();
    const breaker = new CircuitBreakerCacheStore(flaky.store, {
      failureThreshold: 2,
      logger: silent,
    });
    const reads: string[] = [];
    const cache = new Cache({
      store: breaker,
      logger: silent,
      metrics: { onRead: (_ns, result) => reads.push(result), onOperation: () => {} },
    });

    flaky.fail();
    // Devreyi aç (her getOrSet bir get denemesi yapar).
    await cache.getOrSet("a", async () => "A");
    await cache.getOrSet("b", async () => "B");

    // Devre artık açık: istek yine de kaynaktan doğru cevabı almalı.
    expect(await cache.getOrSet("c", async () => "C")).toBe("C");
    // ...ve arıza `error` olarak sayılmalı, sessiz `miss` olarak değil.
    expect(reads).toEqual(["error", "error", "error"]);
  });
});
