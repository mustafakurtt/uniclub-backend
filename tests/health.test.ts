import { describe, it, expect } from "bun:test";
import { app } from "./helpers";

describe("health / readiness", () => {
  it("GET /health → 200 ve bağımlılıklar up", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("up");
    expect(body.checks.cache).toBe("up");
  });
});

describe("liveness", () => {
  /**
   * Dockerfile'ın HEALTHCHECK'i bu uca bağlıdır (bilinçli olarak /health'e değil:
   * bir DB kesintisi container'ları yeniden başlatmasın diye). Ucun kaybolması
   * container'ı "unhealthy" yapardı, o yüzden varlığı testle korunuyor.
   */
  it("GET /live → 200, bağımlılıklara BAKMADAN", async () => {
    const res = await app.request("/live");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("up");
    // Liveness "süreç yaşıyor" demektir; bağımlılık raporu İÇERMEZ — o /health'in işi.
    expect(body.checks).toBeUndefined();
    expect(typeof body.uptimeSeconds).toBe("number");
  });
});
