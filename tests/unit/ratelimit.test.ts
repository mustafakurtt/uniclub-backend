import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  createRateLimiter,
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from "../../src/core/ratelimit";
import { createErrorHandler } from "../../src/core/http/error-handler";
import { createLogger } from "../../src/core/logger/logger";
import { createTranslator } from "../../src/core/i18n/translator";

/**
 * core/ratelimit birim testleri — ALTYAPISIZ koşar (Redis/Postgres yok).
 * core taşınabilir olduğu için her şey enjekte edilebilir: saat (`now`), store,
 * logger. Testin bütün amacı bu dikişleri kullanmak.
 */

const silent = createLogger({ level: "silent" });

/** Sabit bir saat: pencere sınırı davranışını gerçek zaman beklemeden test etmek için. */
function fakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advanceSeconds: (s: number) => {
      current += s * 1000;
    },
  };
}

describe("InMemoryRateLimitStore", () => {
  it("ilk hit penceleyi başlatır (count=1, ttl=pencere)", async () => {
    const store = new InMemoryRateLimitStore();
    expect(await store.hit("k", 60)).toEqual({ count: 1, ttlSeconds: 60 });
  });

  it("aynı pencerede sayacı artırır", async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit("k", 60);
    await store.hit("k", 60);
    expect((await store.hit("k", 60)).count).toBe(3);
  });

  it("anahtarları birbirinden yalıtır", async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit("a", 60);
    await store.hit("a", 60);
    expect((await store.hit("b", 60)).count).toBe(1);
  });

  it("pencere dolunca sayaç sıfırlanır", async () => {
    const clock = fakeClock();
    const store = new InMemoryRateLimitStore({ now: clock.now });
    await store.hit("k", 60);
    await store.hit("k", 60);

    clock.advanceSeconds(61);
    expect(await store.hit("k", 60)).toEqual({ count: 1, ttlSeconds: 60 });
  });

  it("SÖZLEŞME: sonraki hit pencereyi TAZELEMEZ (yoksa limit hiç kapanmaz)", async () => {
    const clock = fakeClock();
    const store = new InMemoryRateLimitStore({ now: clock.now });
    await store.hit("k", 60);

    clock.advanceSeconds(30);
    // Pencere 30 sn ilerledi; kalan süre 30 olmalı — 60'a dönerse pencere tazelenmiş demektir.
    expect((await store.hit("k", 60)).ttlSeconds).toBe(30);
  });

  it("maxEntries aşılınca en eski pencereyi atar (bellek şişmesi savunması)", async () => {
    const store = new InMemoryRateLimitStore({ maxEntries: 2 });
    await store.hit("a", 60);
    await store.hit("b", 60);
    await store.hit("c", 60); // "a" tahliye edilir

    // "a" atıldığı için yeniden 1'den başlar.
    expect((await store.hit("a", 60)).count).toBe(1);
  });
});

describe("RedisRateLimitStore", () => {
  /** ioredis'in pipeline yüzeyini taklit eden minimal sahte istemci. */
  function fakeRedis(incr: number, ttl: number) {
    const calls = { expire: [] as [string, number][] };
    const client = {
      pipeline: () => {
        const p: any = { incr: () => p, ttl: () => p, exec: async () => [[null, incr], [null, ttl]] };
        return p;
      },
      expire: async (key: string, seconds: number) => {
        calls.expire.push([key, seconds]);
        return 1;
      },
    };
    return { client, calls };
  }

  it("INCR + TTL sonucunu döner", async () => {
    const { client } = fakeRedis(3, 42);
    expect(await new RedisRateLimitStore(client).hit("k", 60)).toEqual({ count: 3, ttlSeconds: 42 });
  });

  it("TTL yoksa (-1/-2) pencereyi kurar", async () => {
    const { client, calls } = fakeRedis(1, -2);
    expect(await new RedisRateLimitStore(client).hit("k", 60)).toEqual({ count: 1, ttlSeconds: 60 });
    expect(calls.expire).toEqual([["k", 60]]);
  });

  it("TTL varsa EXPIRE ATMAZ (pencere tazelenmemeli)", async () => {
    const { client, calls } = fakeRedis(5, 30);
    await new RedisRateLimitStore(client).hit("k", 60);
    expect(calls.expire).toEqual([]);
  });

  it("pipeline null dönerse fırlatır (sessizce limiti kapatmaz)", async () => {
    const client = {
      pipeline: () => ({ incr: function () { return this; }, ttl: function () { return this; }, exec: async () => null }),
      expire: async () => 1,
    } as any;
    expect(new RedisRateLimitStore(client).hit("k", 60)).rejects.toThrow();
  });

  it("komut hata verirse fırlatır", async () => {
    const client = {
      pipeline: () => {
        const p: any = {
          incr: () => p,
          ttl: () => p,
          exec: async () => [[new Error("READONLY"), null], [null, 10]],
        };
        return p;
      },
      expire: async () => 1,
    } as any;
    expect(new RedisRateLimitStore(client).hit("k", 60)).rejects.toThrow("READONLY");
  });
});

describe("createRateLimiter", () => {
  /** Limiter'ı gerçek bir Hono uygulamasına takar — proje kurulumunun aynısı. */
  function appWith(limiter: ReturnType<typeof createRateLimiter>) {
    const translate = createTranslator(
      { tr: { "rateLimit.exceeded": "Çok fazla deneme. {minutes} dakika sonra dene." } },
      "tr"
    );
    const app = new Hono();
    app.onError(createErrorHandler({ logger: silent, fallbackMessage: "server.unexpected", translate }));
    app.use("*", limiter);
    app.get("/", (c) => c.json({ ok: true }));
    return app;
  }

  const base = {
    keyPrefix: "test",
    limit: 2,
    windowSeconds: 60,
    keyFn: (c: any) => c.req.header("x-id") ?? "anon",
  };

  it("limit altındaki istekleri geçirir ve RateLimit-* başlıklarını koyar", async () => {
    const app = appWith(createRateLimiter({ ...base, store: new InMemoryRateLimitStore() }));

    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit-Limit")).toBe("2");
    expect(res.headers.get("RateLimit-Remaining")).toBe("1");
    expect(res.headers.get("RateLimit-Reset")).toBe("60");
  });

  it("limit aşılınca 429 + RATE_LIMITED kodu + Retry-After döner", async () => {
    const app = appWith(createRateLimiter({ ...base, store: new InMemoryRateLimitStore() }));

    await app.request("/");
    await app.request("/");
    const res = await app.request("/"); // 3. istek → limit 2 aşıldı

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");

    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
    // Mesaj i18n'den gelmeli ve {minutes} interpolasyonu yapılmış olmalı.
    expect(body.message).toBe("Çok fazla deneme. 1 dakika sonra dene.");
  });

  it("farklı kimlikler birbirinin sayacını yemez", async () => {
    const app = appWith(createRateLimiter({ ...base, store: new InMemoryRateLimitStore() }));

    await app.request("/", { headers: { "x-id": "ali" } });
    await app.request("/", { headers: { "x-id": "ali" } });
    await app.request("/", { headers: { "x-id": "ali" } }); // ali limitte

    const res = await app.request("/", { headers: { "x-id": "veli" } });
    expect(res.status).toBe(200);
  });

  it("keyFn null dönerse limit uygulanmaz", async () => {
    const app = appWith(
      createRateLimiter({ ...base, store: new InMemoryRateLimitStore(), keyFn: () => null })
    );

    for (let i = 0; i < 5; i++) expect((await app.request("/")).status).toBe(200);
  });

  it("FAIL-OPEN: store patlarsa istek geçer (Redis düşünce API kilitlenmez)", async () => {
    const broken: RateLimitStore = {
      hit: () => Promise.reject(new Error("redis down")),
    };
    const app = appWith(createRateLimiter({ ...base, store: broken, logger: silent }));

    const res = await app.request("/");
    expect(res.status).toBe(200);
    // Fail-open'da sayaç bilinmediği için başlık koymayız.
    expect(res.headers.get("RateLimit-Limit")).toBeNull();
  });

  it("disabled=true iken hiç sınırlamaz", async () => {
    const app = appWith(
      createRateLimiter({ ...base, store: new InMemoryRateLimitStore(), disabled: true })
    );

    for (let i = 0; i < 5; i++) expect((await app.request("/")).status).toBe(200);
  });

  it("disabled fonksiyonu her istekte YENİDEN okunur (env sonradan değişebilir)", async () => {
    let off = true;
    const app = appWith(
      createRateLimiter({ ...base, store: new InMemoryRateLimitStore(), disabled: () => off })
    );

    for (let i = 0; i < 5; i++) expect((await app.request("/")).status).toBe(200);

    off = false; // limitleri aç
    await app.request("/");
    await app.request("/");
    expect((await app.request("/")).status).toBe(429);
  });

  it("keyPrefix sayaçları ayırır (endpoint'ler birbirini yemez)", async () => {
    const store = new InMemoryRateLimitStore(); // PAYLAŞILAN store
    const login = appWith(createRateLimiter({ ...base, keyPrefix: "login", store }));
    const register = appWith(createRateLimiter({ ...base, keyPrefix: "register", store }));

    await login.request("/");
    await login.request("/");
    expect((await login.request("/")).status).toBe(429);

    // Aynı kimlik, aynı store — ama farklı prefix → temiz sayaç.
    expect((await register.request("/")).status).toBe(200);
  });
});
