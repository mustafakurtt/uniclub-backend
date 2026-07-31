import { describe, expect, it } from "bun:test";
import { app } from "./helpers";
import { SEED_PASSWORD } from "./config";

/**
 * Login yanıt süresi enumeration — var olmayan e-posta ile var olan+yanlış şifre
 * aynı mertebede olmalı (dummy hash doğrulama).
 */
describe("auth login timing", () => {
  const wrongPassword = "DefinitelyWrongPassword999!";
  const existingEmail = "mustafa.kurt@std.antalya.edu.tr";
  const fakeEmail = `nobody-${Date.now()}@std.antalya.edu.tr`;

  async function loginMs(email: string, password: string): Promise<number> {
    const start = performance.now();
    await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return performance.now() - start;
  }

  it("var olmayan e-posta vs var olan+yanlış şifre süreleri aynı mertebede (oran < 3x)", async () => {
    // Isınma — dummy hash ilk istekte üretilir.
    await loginMs(fakeEmail, wrongPassword);

    const samples = 4;
    let noUserTotal = 0;
    let wrongPassTotal = 0;
    for (let i = 0; i < samples; i++) {
      noUserTotal += await loginMs(fakeEmail, wrongPassword);
      wrongPassTotal += await loginMs(existingEmail, wrongPassword);
    }

    const noUserAvg = noUserTotal / samples;
    const wrongPassAvg = wrongPassTotal / samples;
    const ratio = Math.max(noUserAvg, wrongPassAvg) / Math.min(noUserAvg, wrongPassAvg);

    expect(ratio).toBeLessThan(3);
  });

  it("her iki başarısız yol aynı 401 döner", async () => {
    const noUser = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fakeEmail, password: wrongPassword }),
    });
    const wrongPass = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: existingEmail, password: wrongPassword }),
    });
    expect(noUser.status).toBe(401);
    expect(wrongPass.status).toBe(401);
  });

  it("doğru şifre hâlâ 200", async () => {
    const ok = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: existingEmail, password: SEED_PASSWORD }),
    });
    expect(ok.status).toBe(200);
  });
});
