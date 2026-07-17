import { describe, expect, it } from "bun:test";
import { createShutdownManager } from "../../src/core/http/shutdown";
import { createLogger } from "../../src/core/logger/logger";

/**
 * core/http/shutdown birim testleri. `onExit` enjekte edilebilir olduğu için
 * süreci sonlandırmadan test edilebiliyor — dikişin varlık sebebi tam olarak bu.
 */

const silent = createLogger({ level: "silent" });

/** install() ÇAĞIRMAYAN yönetici: testler process sinyallerine dokunmaz. */
function manager(timeoutMs?: number) {
  const exits: number[] = [];
  const sm = createShutdownManager({
    logger: silent,
    onExit: (code) => exits.push(code),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  return { sm, exits };
}

describe("createShutdownManager", () => {
  it("görevleri KAYIT SIRASIYLA çalıştırır (önce trafiği kes, sonra bağımlılıklar)", async () => {
    const { sm } = manager();
    const order: string[] = [];

    sm.register("http-server", () => void order.push("http"));
    sm.register("queue", () => void order.push("queue"));
    sm.register("db", () => void order.push("db"));

    await sm.shutdown("test");
    expect(order).toEqual(["http", "queue", "db"]);
  });

  it("başarılı kapanışta 0 ile çıkar", async () => {
    const { sm, exits } = manager();
    await sm.shutdown("SIGTERM");
    expect(exits).toEqual([0]);
  });

  it("bir görev patlarsa DİĞERLERİ yine de koşar (best-effort)", async () => {
    const { sm, exits } = manager();
    const order: string[] = [];

    sm.register("ok-1", () => void order.push("ok-1"));
    sm.register("patlak", () => {
      throw new Error("kapanamadı");
    });
    sm.register("ok-2", () => void order.push("ok-2"));

    await sm.shutdown("test");
    expect(order).toEqual(["ok-1", "ok-2"]); // patlak diğerlerini engellemedi
    expect(exits).toEqual([0]);
  });

  it("async görevleri BEKLER (yarım iş kalmasın)", async () => {
    const { sm } = manager();
    let bitti = false;

    sm.register("yavaş", async () => {
      await Bun.sleep(30);
      bitti = true;
    });

    await sm.shutdown("test");
    expect(bitti).toBe(true);
  });

  it("ikinci çağrı yok sayılır (aynı anda iki sinyal)", async () => {
    const { sm, exits } = manager();
    let calls = 0;
    sm.register("task", () => void calls++);

    await sm.shutdown("SIGTERM");
    await sm.shutdown("SIGINT");

    expect(calls).toBe(1);
    expect(exits).toEqual([0]); // tek çıkış
  });

  it("bütçe aşılırsa 1 ile zorla çıkar (askıda kaynak deploy'u kilitlemesin)", async () => {
    const { sm, exits } = manager(30);
    sm.register("asılı", () => new Promise<void>(() => {})); // asla çözülmez

    void sm.shutdown("test");
    await Bun.sleep(80);

    expect(exits).toEqual([1]);
  });

  it("görev yoksa temiz çıkar", async () => {
    const { sm, exits } = manager();
    await sm.shutdown("test");
    expect(exits).toEqual([0]);
  });
});
