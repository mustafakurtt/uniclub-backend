import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createRateLimiter, InMemoryRateLimitStore } from "../../src/core/ratelimit";
import { createErrorHandler } from "../../src/core/http/error-handler";
import { createLogger } from "../../src/core/logger/logger";
import { createTranslator } from "../../src/core/i18n/translator";

const silent = createLogger({ level: "silent" });

describe("kamuya açık IP tavanı (publicReadIpLimit)", () => {
  it("limit aşıldığında 429 döner", async () => {
    const translate = createTranslator(
      { tr: { "rateLimit.exceeded": "Çok fazla deneme. {minutes} dakika sonra dene." } },
      "tr"
    );
    const limiter = createRateLimiter({
      keyPrefix: "public:ip:test",
      limit: 3,
      windowSeconds: 60,
      keyFn: () => "203.0.113.1",
      store: new InMemoryRateLimitStore(),
      disabled: () => false,
    });

    const app = new Hono();
    app.onError(createErrorHandler({ logger: silent, fallbackMessage: "server.unexpected", translate }));
    app.use("*", limiter);
    app.get("/", (c) => c.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      expect((await app.request("/", { headers: { "x-forwarded-for": "203.0.113.1" } })).status).toBe(200);
    }
    expect((await app.request("/", { headers: { "x-forwarded-for": "203.0.113.1" } })).status).toBe(429);
  });
});
