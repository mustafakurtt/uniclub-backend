import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { clientIp } from "../../src/middlewares/rate-limit.middleware";

/**
 * `clientIp` iki yerde kullanılıyor: hız sınırlayıcıların ANAHTARI ve denetim
 * kaydının `ip` alanı. Her ikisinde de yan bilgidir — çözülemiyor olması isteği
 * düşürmemeli. Bu dosya iki sözleşmeyi kilitler:
 *   1. ASLA fırlatmaz (fırlattığında denetim kayıtları sessizce yazılmıyordu),
 *   2. çözülemezse `null` döner — sabit bir yer tutucu DEĞİL, çünkü o değer
 *      sayaç anahtarı olur ve herkesi tek kovaya toplardı.
 */
const ipOf = async (headers: Record<string, string> = {}): Promise<string | null> => {
  const app = new Hono();
  let sonuc: string | null | undefined;
  app.get("/", (c) => {
    sonuc = clientIp(c); // fırlatırsa test burada patlar — istenen davranış bu
    return c.json({ ok: true });
  });

  const res = await app.request("/", { headers });
  expect(res.status).toBe(200); // fırlatma isteği düşürmemeli
  return sonuc as string | null;
};

describe("clientIp", () => {
  it("soket bilgisi YOKKEN fırlatmaz, null döner", async () => {
    // `app.request()` gerçek bir sokete bağlı değildir: hono/bun'ın getConnInfo'su
    // `c.env.server`i arar, bulamaz ve TypeError atar. Sarmalanmış olmalı.
    expect(await ipOf()).toBeNull();
  });

  it("TRUST_PROXY kapalıyken X-Forwarded-For'a GÜVENMEZ", async () => {
    // Testler TRUST_PROXY=false ile koşar (varsayılan). Proxy arkasında değilken
    // bu başlığa güvenmek, istemcinin kendi IP'sini uydurup hız sınırını
    // atlatmasına izin verirdi — sessizce kabul edilmediğini doğrula.
    expect(await ipOf({ "x-forwarded-for": "1.2.3.4" })).toBeNull();
    expect(await ipOf({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })).toBeNull();
  });
});
