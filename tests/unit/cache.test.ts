import { describe, expect, it } from "bun:test";
import { Cache, InMemoryCacheStore, NullCacheStore, type CacheStore } from "../../src/core/cache";
import { createLogger } from "../../src/core/logger/logger";

/** core/cache birim testleri — altyapısız (InMemory adaptörü + sahte store'lar). */

const silent = createLogger({ level: "silent" });

describe("InMemoryCacheStore", () => {
  it("yazar ve okur", async () => {
    const store = new InMemoryCacheStore();
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
  });

  it("olmayan anahtar için null", async () => {
    expect(await new InMemoryCacheStore().get("yok")).toBeNull();
  });

  it("TTL dolunca null (tembel süre dolumu)", async () => {
    const store = new InMemoryCacheStore();
    await store.set("k", "v", 1);
    expect(await store.get("k")).toBe("v");
    await Bun.sleep(1100);
    expect(await store.get("k")).toBeNull();
  });

  it("maxEntries aşılınca en eskiyi atar (LRU)", async () => {
    const store = new InMemoryCacheStore({ maxEntries: 2 });
    await store.set("a", "1");
    await store.set("b", "2");
    await store.get("a"); // "a"yı tazele → en eski artık "b"
    await store.set("c", "3");

    expect(await store.get("a")).toBe("1");
    expect(await store.get("b")).toBeNull();
    expect(await store.get("c")).toBe("3");
  });

  it("delete boş dizide no-op", async () => {
    expect(new InMemoryCacheStore().delete([])).resolves.toBeUndefined();
  });
});

describe("NullCacheStore", () => {
  it("yazar ama hiçbir şey saklamaz (cache kapalı)", async () => {
    // CacheStore olarak tipliyoruz: Liskov ikamesi bu sınıfın varlık sebebi —
    // uygulama cache tamamen kapalıyken de doğru çalışmalı.
    const store: CacheStore = new NullCacheStore();
    await store.set("k", "v");
    expect(await store.get("k")).toBeNull();
  });

  it("Cache facade ile birlikte: her okuma miss, loader her seferinde koşar", async () => {
    const c = new Cache({ store: new NullCacheStore(), logger: silent });
    let calls = 0;

    await c.getOrSet("k", async () => ++calls);
    await c.getOrSet("k", async () => ++calls);

    expect(calls).toBe(2);
  });
});

describe("Cache facade", () => {
  const cache = () => new Cache({ store: new InMemoryCacheStore(), logger: silent });

  it("nesneleri kodlayıp çözer (tipli get/set)", async () => {
    const c = cache();
    await c.set("user", { id: 1, name: "Ada" });
    expect(await c.get<{ id: number; name: string }>("user")).toEqual({ id: 1, name: "Ada" });
  });

  it("namespace anahtar uzayını yalıtır", async () => {
    const root = cache();
    await root.namespace("a").set("k", "A");
    await root.namespace("b").set("k", "B");

    expect(await root.namespace("a").get<string>("k")).toBe("A");
    expect(await root.namespace("b").get<string>("k")).toBe("B");
    expect(await root.get<string>("k")).toBeNull(); // öneksiz anahtar başka bir şey
  });

  it("namespace zincirlenebilir", async () => {
    const root = cache();
    await root.namespace("university").namespace("faculties").set("1", "x");
    expect(await root.get<string>("university:faculties:1")).toBe("x");
  });

  it("getOrSet: miss'te loader'ı çağırır, hit'te çağırmaz", async () => {
    const c = cache();
    let calls = 0;
    const load = async () => {
      calls++;
      return "değer";
    };

    expect(await c.getOrSet("k", load)).toBe("değer");
    expect(await c.getOrSet("k", load)).toBe("değer");
    expect(calls).toBe(1);
  });

  it("SINGLE-FLIGHT: eşzamanlı miss'lerde loader BİR kez koşar (stampede koruması)", async () => {
    const c = cache();
    let calls = 0;
    const load = async () => {
      calls++;
      await Bun.sleep(20);
      return "değer";
    };

    const results = await Promise.all(Array.from({ length: 10 }, () => c.getOrSet("k", load)));

    expect(results).toEqual(Array(10).fill("değer"));
    expect(calls).toBe(1); // 10 eşzamanlı istek → DB'ye 1 sorgu
  });

  it("single-flight, aynı tam anahtarı paylaşan namespace nesnelerini de kapsar", async () => {
    const root = cache();
    let calls = 0;
    const load = async () => {
      calls++;
      await Bun.sleep(20);
      return "v";
    };

    // Farklı Cache NESNELERİ ama aynı tam anahtar → yine tek yükleme.
    await Promise.all([root.namespace("ns").getOrSet("k", load), root.namespace("ns").getOrSet("k", load)]);
    expect(calls).toBe(1);
  });

  it("getOrSet null/undefined'ı CACHE'LEMEZ (negatif cache'ten kaçınma)", async () => {
    const c = cache();
    let calls = 0;
    const load = async () => {
      calls++;
      return null;
    };

    await c.getOrSet("k", load);
    await c.getOrSet("k", load);
    expect(calls).toBe(2); // "bulunamadı" kalıcı yanlış sonuca dönmemeli
  });

  it("FAIL-OPEN: store okuma patlarsa miss'e düşer, fırlatmaz", async () => {
    const broken: CacheStore = {
      get: () => Promise.reject(new Error("redis down")),
      set: async () => {},
      delete: async () => {},
    };
    const c = new Cache({ store: broken, logger: silent });

    expect(await c.get<string>("k")).toBeNull();
    expect(await c.getOrSet("k", async () => "kaynaktan")).toBe("kaynaktan");
  });

  it("FAIL-OPEN: getOrSet iç yazımı patlarsa yine de değeri döner", async () => {
    const store: CacheStore = {
      get: async () => null,
      set: () => Promise.reject(new Error("redis down")),
      delete: async () => {},
    };
    const c = new Cache({ store, logger: silent });
    expect(await c.getOrSet("k", async () => "değer")).toBe("değer");
  });

  it("ama delete (invalidasyon) hatayı YUTMAZ — bayat yetki doğruluk hatasıdır", async () => {
    const store: CacheStore = {
      get: async () => null,
      set: async () => {},
      delete: () => Promise.reject(new Error("redis down")),
    };
    const c = new Cache({ store, logger: silent });
    expect(c.delete("k")).rejects.toThrow("redis down");
  });

  it("bozuk değer miss sayılır ve temizlenir", async () => {
    const store = new InMemoryCacheStore();
    await store.set("k", "{bozuk-json"); // codec'in çözemeyeceği değer
    const c = new Cache({ store, logger: silent });

    expect(await c.get<string>("k")).toBeNull();
    expect(await c.getOrSet("k", async () => "yeniden")).toBe("yeniden");
  });

  it("delete birden çok anahtarı siler", async () => {
    const c = cache();
    await c.set("a", 1);
    await c.set("b", 2);
    await c.delete(["a", "b"]);

    expect(await c.get<number>("a")).toBeNull();
    expect(await c.get<number>("b")).toBeNull();
  });
});
