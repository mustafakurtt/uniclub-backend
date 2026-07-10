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
