import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createHealth, type HealthReport } from "../../src/core/http/health";
import { createShutdownManager } from "../../src/core/http/shutdown";

/**
 * `createHealth` — liveness/readiness mekanizması. Uygulamanın GERÇEK /health
 * ucu (bağımlılık listesi + cevap şekli) src/index.ts'te kurulur ve
 * tests/health.test.ts onu uçtan uca doğrular; burası mekanizmanın kendisidir.
 */
const buildApp = (health: ReturnType<typeof createHealth>) => {
  const app = new Hono();
  app.get("/live", health.live);
  app.get("/ready", health.ready);
  return app;
};

const ready = async (app: Hono) => {
  const res = await app.request("/ready");
  return { status: res.status, body: (await res.json()) as HealthReport };
};

describe("createHealth — liveness", () => {
  it("bağımlılıklara BAKMAZ: kontrol tanımlı olsa bile çalıştırmaz", async () => {
    let called = false;
    const health = createHealth({
      checks: [{ name: "db", run: () => { called = true; throw new Error("db down"); } }],
    });

    expect((await buildApp(health).request("/live")).status).toBe(200);
    expect(called).toBe(false);
  });

  it("DRAIN sırasında da 200 döner — aksi halde orkestratör süreci SIGKILL'lerdi", async () => {
    const health = createHealth();
    health.drain();
    expect((await buildApp(health).request("/live")).status).toBe(200);
  });
});

describe("createHealth — readiness", () => {
  it("tüm kritik kontroller geçerse 200", async () => {
    const health = createHealth({
      checks: [
        { name: "db", run: async () => {} },
        { name: "cache", run: () => {} },
      ],
    });

    const { status, body } = await ready(buildApp(health));
    expect(status).toBe(200);
    expect(body.checks.map((c) => [c.name, c.status])).toEqual([
      ["db", "up"],
      ["cache", "up"],
    ]);
  });

  it("KRİTİK kontrol düşerse 503", async () => {
    const health = createHealth({
      checks: [
        { name: "db", run: () => { throw new Error("connection refused"); } },
        { name: "cache", run: () => {} },
      ],
    });

    const { status, body } = await ready(buildApp(health));
    expect(status).toBe(503);
    expect(body.checks.find((c) => c.name === "db")?.status).toBe("down");
  });

  it("KRİTİK OLMAYAN kontrol düşerse rapora girer ama 200 kalır", async () => {
    // Örn. SMTP: kesintisi mail göndermeyi durdurur ama API'yi servis dışı bırakmaz.
    const health = createHealth({
      checks: [{ name: "smtp", critical: false, run: () => { throw new Error("smtp down"); } }],
    });

    const { status, body } = await ready(buildApp(health));
    expect(status).toBe(200);
    expect(body.checks[0]).toMatchObject({ name: "smtp", status: "down", critical: false });
  });

  it("hata mesajı VARSAYILAN olarak sızmaz; exposeErrors ile açılır", async () => {
    const failing = { name: "db", run: () => { throw new Error("host=10.0.0.4 auth failed"); } };

    const gizli = await ready(buildApp(createHealth({ checks: [failing] })));
    expect(gizli.body.checks[0].error).toBeUndefined();

    const acik = await ready(buildApp(createHealth({ checks: [failing], exposeErrors: true })));
    expect(acik.body.checks[0].error).toBe("host=10.0.0.4 auth failed");
  });

  it("ASKIDA kalan kontrol timeoutMs'te kesilir ve 'down' sayılır", async () => {
    const health = createHealth({
      timeoutMs: 20,
      exposeErrors: true,
      checks: [{ name: "hung", run: () => new Promise<void>(() => {}) }],
    });

    const { status, body } = await ready(buildApp(health));
    expect(status).toBe(503);
    expect(body.checks[0].error).toContain("timed out");
  });

  it("kontroller PARALEL koşar — toplam süre en yavaş kontrol kadardır", async () => {
    const slow = (ms: number) => () => new Promise<void>((r) => setTimeout(r, ms));
    const health = createHealth({
      checks: [
        { name: "a", run: slow(60) },
        { name: "b", run: slow(60) },
        { name: "c", run: slow(60) },
      ],
    });

    const start = Date.now();
    expect((await ready(buildApp(health))).status).toBe(200);
    expect(Date.now() - start).toBeLessThan(150); // sırayla koşsaydı ≥180ms
  });
});

describe("createHealth — kapanış draini", () => {
  it("drain sonrası readiness 503 döner (bağımlılıklar sağlıklı olsa bile)", async () => {
    const health = createHealth({ checks: [{ name: "db", run: () => {} }] });
    const app = buildApp(health);

    expect((await ready(app)).status).toBe(200);
    health.drain();

    const { status, body } = await ready(app);
    expect(status).toBe(503);
    expect(body.draining).toBe(true);
    expect(body.checks[0].status).toBe("up"); // 503'ün TEK sebebi drain
  });

  it("shutdown zincirinde FIFO: sunucu kapanmadan ÖNCE drain tamamlanır", async () => {
    const health = createHealth();
    const order: string[] = [];
    const shutdown = createShutdownManager({ onExit: () => order.push("exit") });

    shutdown.register("drain", health.drainTask(0));
    shutdown.register("http-server", () => {
      order.push(health.draining ? "http-after-drain" : "http-before-drain");
    });

    await shutdown.shutdown("SIGTERM");
    expect(order).toEqual(["http-after-drain", "exit"]);
  });
});
