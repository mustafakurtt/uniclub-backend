import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  Cache,
  InMemoryCacheStore,
  defineKeyspace,
  dropEntries,
  effect,
  entry,
  fromParams,
  invalidates,
  uncoveredEntries,
  type CacheStore,
} from "../../src/core/cache";
import { createLogger } from "../../src/core/logger/logger";

/**
 * core/cache keyspace + efekt + invalidates birim testleri — altyapısız
 * (InMemory adaptörü + sahte store'lar + Hono'nun app.request'i).
 */

const silent = createLogger({ level: "silent" });
const newCache = () => new Cache({ store: new InMemoryCacheStore(), logger: silent });

/** Silinen anahtarları kaydeden gözlemci store (adaptörün üstünde ince sarmalayıcı). */
function spyStore(inner: CacheStore = new InMemoryCacheStore()) {
  const deleted: string[][] = [];
  const store: CacheStore = {
    get: (key) => inner.get(key),
    set: (key, value, ttl) => inner.set(key, value, ttl),
    delete: (keys) => {
      deleted.push(keys);
      return inner.delete(keys);
    },
  };
  return { store, deleted };
}

// Testlerde kullanılan örnek keyspace (university'nin şeklini taklit eder).
function buildKeyspace(cache: Cache) {
  return defineKeyspace(cache, "university", {
    list: entry<{ id: string }[]>()("list"),
    byId: entry<{ id: string } | undefined>()((universityId: string) => `byId:${universityId}`),
    faculties: entry<{ id: string }[]>()((universityId: string) => `faculties:${universityId}`),
    departments: entry<{ id: string }[]>()((facultyId: string) => `departments:${facultyId}`),
    counts: entry<number>()((id: string) => `counts:${id}`, { ttlSeconds: 1 }),
  });
}

describe("defineKeyspace", () => {
  it("anahtarları namespace önekiyle üretir", async () => {
    const cache = newCache();
    const keys = buildKeyspace(cache);

    await keys.faculties("u1").read(async () => [{ id: "f1" }]);

    // Namespace öneki gerçekten uygulanmış olmalı (kök cache'ten okunabiliyor).
    expect(await cache.get<{ id: string }[]>("university:faculties:u1")).toEqual([{ id: "f1" }]);
    expect(keys.faculties("u1").key).toBe("faculties:u1");
  });

  it("read: read-through — miss'te loader koşar, hit'te koşmaz", async () => {
    const keys = buildKeyspace(newCache());
    let calls = 0;
    const load = async () => {
      calls++;
      return [{ id: "u1" }];
    };

    expect(await keys.list().read(load)).toEqual([{ id: "u1" }]);
    expect(await keys.list().read(load)).toEqual([{ id: "u1" }]);
    expect(calls).toBe(1);
  });

  it("read: undefined dönen loader cache'lenmez (negatif cache'ten kaçınma)", async () => {
    const keys = buildKeyspace(newCache());
    let calls = 0;
    const load = async () => {
      calls++;
      return undefined;
    };

    await keys.byId("yok").read(load);
    await keys.byId("yok").read(load);
    expect(calls).toBe(2);
  });

  it("drop: yalnızca o girdiyi düşürür, komşularına dokunmaz", async () => {
    const keys = buildKeyspace(newCache());
    await keys.faculties("u1").read(async () => [{ id: "f1" }]);
    await keys.faculties("u2").read(async () => [{ id: "f2" }]);

    await keys.faculties("u1").drop();

    let reloaded = false;
    await keys.faculties("u1").read(async () => {
      reloaded = true;
      return [];
    });
    let u2Reloaded = false;
    await keys.faculties("u2").read(async () => {
      u2Reloaded = true;
      return [];
    });

    expect(reloaded).toBe(true);
    expect(u2Reloaded).toBe(false);
  });

  it("girdiye özel TTL uygulanır", async () => {
    const keys = buildKeyspace(newCache());
    let calls = 0;
    const load = async () => ++calls;

    await keys.counts("c1").read(load);
    await keys.counts("c1").read(load);
    expect(calls).toBe(1);

    await Bun.sleep(1100); // ttlSeconds: 1 doldu
    await keys.counts("c1").read(load);
    expect(calls).toBe(2);
  });
});

describe("effect", () => {
  it("entries() SAF: cache'e dokunmadan hangi anahtarların düşeceğini söyler", () => {
    const keys = buildKeyspace(newCache());
    const facultyDeleted = effect(
      "facultyDeleted",
      (universityId: string, facultyId: string) => [
        keys.faculties(universityId),
        keys.departments(facultyId),
      ]
    );

    expect(facultyDeleted.entries("u1", "f1").map((e) => e.key)).toEqual([
      "faculties:u1",
      "departments:f1",
    ]);
  });

  it("emit(): etkilenen tüm girdileri düşürür", async () => {
    const keys = buildKeyspace(newCache());
    await keys.list().read(async () => [{ id: "u1" }]);
    await keys.byId("u1").read(async () => ({ id: "u1" }));

    const updated = effect("updated", (universityId: string) => [
      keys.list(),
      keys.byId(universityId),
    ]);
    await updated.emit("u1");

    let listReloaded = false;
    let byIdReloaded = false;
    await keys.list().read(async () => {
      listReloaded = true;
      return [];
    });
    await keys.byId("u1").read(async () => {
      byIdReloaded = true;
      return { id: "u1" };
    });

    expect(listReloaded).toBe(true);
    expect(byIdReloaded).toBe(true);
  });

  it("aynı namespace'teki anahtarlar TEK delete çağrısında toplanır (tur azaltma)", async () => {
    const { store, deleted } = spyStore();
    const keys = buildKeyspace(new Cache({ store, logger: silent }));

    await dropEntries([keys.list(), keys.byId("u1"), keys.faculties("u1")]);

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toEqual([
      "university:list",
      "university:byId:u1",
      "university:faculties:u1",
    ]);
  });

  it("tekrar eden anahtarlar teke iner", async () => {
    const { store, deleted } = spyStore();
    const keys = buildKeyspace(new Cache({ store, logger: silent }));

    await dropEntries([keys.list(), keys.list()]);

    expect(deleted[0]).toEqual(["university:list"]);
  });

  it("çapraz-namespace efektte her namespace kendi delete'ini alır", async () => {
    const { store, deleted } = spyStore();
    const cache = new Cache({ store, logger: silent });
    const uni = buildKeyspace(cache);
    const other = defineKeyspace(cache, "clubs", { list: entry<string[]>()("list") });

    await dropEntries([uni.list(), other.list()]);

    expect(deleted).toHaveLength(2);
    expect(deleted.flat().sort()).toEqual(["clubs:list", "university:list"]);
  });

  it("emit hatayı YUTMAZ — çağıran ne yapacağına kendi karar verir", async () => {
    const broken: CacheStore = {
      get: async () => null,
      set: async () => {},
      delete: () => Promise.reject(new Error("redis down")),
    };
    const keys = buildKeyspace(new Cache({ store: broken, logger: silent }));
    const e = effect("x", () => [keys.list()]);

    expect(e.emit()).rejects.toThrow("redis down");
  });
});

describe("şema damgası (version)", () => {
  it("sürüm anahtar uzayını ayırır — eski girdilere erişilmez", async () => {
    const cache = newCache();
    const v1 = defineKeyspace(cache, "uni", { list: entry<string[]>()("list") });
    const v2 = defineKeyspace(cache, "uni", { list: entry<string[]>()("list") }, { version: 2 });

    await v1.list().read(async () => ["eski şekil"]);

    let reloaded = false;
    const fresh = await v2.list().read(async () => {
      reloaded = true;
      return ["yeni şekil"];
    });

    expect(reloaded).toBe(true); // v2 v1'in girdisini GÖRMEZ
    expect(fresh).toEqual(["yeni şekil"]);
    expect(await cache.get<string[]>("uni:list")).toEqual(["eski şekil"]); // v1 duruyor (TTL ile düşer)
    expect(await cache.get<string[]>("uni:v2:list")).toEqual(["yeni şekil"]);
  });
});

describe("uncoveredEntries (kapsam denetimi)", () => {
  it("hiçbir efektin düşürmediği girdiyi bildirir", () => {
    const keys = buildKeyspace(newCache());
    const onlyList = effect("x", () => [keys.list()]);

    // `counts` bilerek dışarıda: kapsanmayanlar arasında görünmeli.
    expect(uncoveredEntries(keys, [onlyList.entries()])).toEqual([
      "byId",
      "faculties",
      "departments",
      "counts",
    ]);
  });

  it("her girdi bir efektle kapsanıyorsa boş döner", () => {
    const keys = buildKeyspace(newCache());
    const all = effect("all", (id: string) => [
      keys.list(),
      keys.byId(id),
      keys.faculties(id),
      keys.departments(id),
      keys.counts(id),
    ]);

    expect(uncoveredEntries(keys, [all.entries("x")])).toEqual([]);
  });
});

describe("invalidates() middleware", () => {
  /** Efekti ve düşürülen anahtarları gözleyen minimal kurulum. */
  function setup() {
    const { store, deleted } = spyStore();
    const cache = new Cache({ store, logger: silent });
    const keys = buildKeyspace(cache);
    const facultyChanged = effect("facultyChanged", (universityId: string) => [
      keys.faculties(universityId),
    ]);
    return { cache, keys, facultyChanged, deleted };
  }

  it("2xx'te efekti tetikler ve path parametrelerini çözer", async () => {
    const { facultyChanged, deleted } = setup();
    const app = new Hono();
    app.post(
      "/u/:universityId/faculties",
      invalidates(facultyChanged, fromParams("universityId"), { logger: silent }),
      (c) => c.json({ ok: true }, 201)
    );

    const res = await app.request("/u/u1/faculties", { method: "POST" });

    expect(res.status).toBe(201);
    expect(deleted).toEqual([["university:faculties:u1"]]);
  });

  it("hata durumunda (4xx) invalidasyon YAPMAZ", async () => {
    const { facultyChanged, deleted } = setup();
    const app = new Hono();
    app.post(
      "/u/:universityId/faculties",
      invalidates(facultyChanged, fromParams("universityId"), { logger: silent }),
      (c) => c.json({ error: true }, 403)
    );

    await app.request("/u/u1/faculties", { method: "POST" });
    expect(deleted).toEqual([]);
  });

  it("handler fırlatırsa invalidasyon YAPMAZ (mutasyon gerçekleşmedi)", async () => {
    const { facultyChanged, deleted } = setup();
    const app = new Hono();
    app.onError((_e, c) => c.json({ error: true }, 500));
    app.post(
      "/u/:universityId/faculties",
      invalidates(facultyChanged, fromParams("universityId"), { logger: silent }),
      () => {
        throw new Error("iş kuralı patladı");
      }
    );

    const res = await app.request("/u/u1/faculties", { method: "POST" });
    expect(res.status).toBe(500);
    expect(deleted).toEqual([]);
  });

  it("gerçekten bayatlığı önler: yazma sonrası okuma kaynağa gider", async () => {
    const { keys, facultyChanged } = setup();
    let loads = 0;
    const load = async () => {
      loads++;
      return [{ id: `f${loads}` }];
    };

    const app = new Hono();
    app.get("/u/:universityId/faculties", async (c) =>
      c.json(await keys.faculties(c.req.param("universityId")).read(load))
    );
    app.post(
      "/u/:universityId/faculties",
      invalidates(facultyChanged, fromParams("universityId"), { logger: silent }),
      (c) => c.json({ ok: true }, 201)
    );

    expect(await (await app.request("/u/u1/faculties")).json()).toEqual([{ id: "f1" }]);
    expect(await (await app.request("/u/u1/faculties")).json()).toEqual([{ id: "f1" }]); // hit
    await app.request("/u/u1/faculties", { method: "POST" });
    expect(await (await app.request("/u/u1/faculties")).json()).toEqual([{ id: "f2" }]); // taze
  });

  it("parametresiz efekt çözücü İSTEMEZ", async () => {
    const { keys, deleted } = setup();
    const created = effect("created", () => [keys.list()]);
    const app = new Hono();
    app.post("/u", invalidates(created, { logger: silent }), (c) => c.json({ ok: true }, 201));

    await app.request("/u", { method: "POST" });
    expect(deleted).toEqual([["university:list"]]);
  });

  it("çözücü handler'dan SONRA koşar — c.set ile bırakılan değeri okuyabilir", async () => {
    const { keys, deleted } = setup();
    const created = effect("created", (facultyId: string) => [keys.departments(facultyId)]);
    const app = new Hono<{ Variables: { newId: string } }>();
    app.post(
      "/x",
      invalidates(created, (c) => [c.get("newId") as string], { logger: silent }),
      (c) => {
        c.set("newId", "f-yeni");
        return c.json({ ok: true }, 201);
      }
    );

    await app.request("/x", { method: "POST" });
    expect(deleted).toEqual([["university:departments:f-yeni"]]);
  });

  it("invalidasyon patlarsa istek DÜŞMEZ (yazma zaten tamamlandı)", async () => {
    const broken: CacheStore = {
      get: async () => null,
      set: async () => {},
      delete: () => Promise.reject(new Error("redis down")),
    };
    const keys = buildKeyspace(new Cache({ store: broken, logger: silent }));
    const e = effect("x", () => [keys.list()]);

    const app = new Hono();
    app.post("/u", invalidates(e, { logger: silent }), (c) => c.json({ ok: true }, 201));

    const res = await app.request("/u", { method: "POST" });
    expect(res.status).toBe(201);
  });

  it("fromParams: rotada olmayan parametre sessizce geçilmez", async () => {
    const { facultyChanged, deleted } = setup();
    const app = new Hono();
    app.post(
      "/u/:universityId/faculties",
      // Kasten yanlış ad — yanlış anahtar silmektense hiç silmemek ve loglamak yeğdir.
      invalidates(facultyChanged, fromParams("yanlisAd"), { logger: silent }),
      (c) => c.json({ ok: true }, 201)
    );

    const res = await app.request("/u/u1/faculties", { method: "POST" });
    expect(res.status).toBe(201); // istek düşmez
    expect(deleted).toEqual([]); // ama yanlış anahtar da silinmez
  });
});
