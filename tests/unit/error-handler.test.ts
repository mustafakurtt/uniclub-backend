import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createErrorHandler } from "../../src/core/http/error-handler";
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from "../../src/core/http/errors";
import { createLogger } from "../../src/core/logger/logger";
import { createTranslator } from "../../src/core/i18n/translator";

/**
 * core/http/error-handler birim testleri. En kritik güvenlik davranışı burada:
 * ALTYAPI hatası (pg/drizzle/TypeError) istemciye SIZMAMALI — jenerik 500.
 */

const silent = createLogger({ level: "silent" });

const translate = createTranslator(
  {
    tr: { "club.notFound": "Kulüp bulunamadı.", "server.unexpected": "Beklenmeyen hata." },
    en: { "club.notFound": "Club not found.", "server.unexpected": "Unexpected error." },
  },
  "tr"
);

/** Bu projenin konvansiyonu: düz `Error` = iş kuralı hatası (alt sınıflar değil). */
const isBusinessError = (e: unknown): e is Error => e instanceof Error && e.constructor === Error;

function appThrowing(err: unknown, options?: { locale?: string }) {
  const app = new Hono();
  app.onError(
    createErrorHandler({
      logger: silent,
      fallbackMessage: "server.unexpected",
      isBusinessError,
      translate,
      getRequestId: () => "req-1",
      getLocale: () => options?.locale ?? "tr",
    })
  );
  app.get("/", () => {
    throw err;
  });
  return app;
}

describe("createErrorHandler", () => {
  it("HttpError kendi status'unu taşır", async () => {
    const res = await appThrowing(new NotFoundError("club.notFound")).request("/");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      message: "Kulüp bulunamadı.",
      requestId: "req-1",
    });
  });

  it("mesaj anahtarını isteğin diline çevirir", async () => {
    const res = await appThrowing(new NotFoundError("club.notFound"), { locale: "en" }).request("/");
    expect((await res.json()).message).toBe("Club not found.");
  });

  it("status mesaj METNİNDEN çıkarılmaz — açıkça taşınır", async () => {
    // Eski tasarım "bulunamadı" geçen mesajı 404'e çeviriyordu; bu dile yapışıktı.
    const res = await appThrowing(new ForbiddenError("club.notFound")).request("/");
    expect(res.status).toBe(403);
  });

  it("code ve details cevaba eklenir", async () => {
    const err = new ValidationError("validation.failed", { details: [{ path: "email" }] });
    const res = await appThrowing(err).request("/");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ path: "email" }],
    });
  });

  it("TooManyRequestsError → 429 + RATE_LIMITED", async () => {
    const res = await appThrowing(new TooManyRequestsError("rateLimit.exceeded")).request("/");
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });

  it("params ile mesaj interpolasyonu yapar", async () => {
    const t = createTranslator({ tr: { "wait": "{minutes} dakika bekle." } }, "tr");
    const app = new Hono();
    app.onError(createErrorHandler({ logger: silent, fallbackMessage: "x", translate: t }));
    app.get("/", () => {
      throw new HttpError(429, "wait", { params: { minutes: 15 } });
    });

    expect((await (await app.request("/")).json()).message).toBe("15 dakika bekle.");
  });

  it("expose=false ise mesaj SIZMAZ → jenerik 500", async () => {
    const err = new HttpError(400, "iç detay: tablo users", { expose: false });
    const res = await appThrowing(err).request("/");

    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe("Beklenmeyen hata.");
  });

  it("Hono HTTPException kendi status'uyla döner", async () => {
    const res = await appThrowing(new HTTPException(401, { message: "yetkisiz" })).request("/");
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe("yetkisiz");
  });

  it("düz Error (proje konvansiyonu) → 400 iş hatası", async () => {
    const res = await appThrowing(new Error("Kulüp zaten mevcut.")).request("/");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Kulüp zaten mevcut.");
  });

  it("GÜVENLİK: altyapı hatası (Error ALT SINIFI) sızmaz → jenerik 500", async () => {
    // pg → DatabaseError, drizzle → DrizzleQueryError, runtime → TypeError.
    // Hepsi Error alt sınıfıdır; mesajları SQL/tablo adı taşır ve asla dönmemeli.
    class DatabaseError extends Error {}
    const res = await appThrowing(new DatabaseError('relation "users" does not exist')).request("/");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Beklenmeyen hata.");
    expect(JSON.stringify(body)).not.toContain("users");
  });

  it("TypeError de sızmaz", async () => {
    const res = await appThrowing(new TypeError("x is not a function")).request("/");
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe("Beklenmeyen hata.");
  });

  it("isBusinessError verilmezse düz Error de jenerik 500 olur", async () => {
    const app = new Hono();
    app.onError(createErrorHandler({ logger: silent, fallbackMessage: "server.unexpected", translate }));
    app.get("/", () => {
      throw new Error("iç detay");
    });

    const res = await app.request("/");
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe("Beklenmeyen hata.");
  });

  it("her cevapta requestId var (kullanıcı hatası sunucu loguyla eşleşsin)", async () => {
    const res = await appThrowing(new Error("iş hatası")).request("/");
    expect((await res.json()).requestId).toBe("req-1");
  });

  it("translate verilmezse mesaj aynen döner (i18n'siz proje de kullanabilir)", async () => {
    const app = new Hono();
    app.onError(createErrorHandler({ logger: silent, fallbackMessage: "Server error" }));
    app.get("/", () => {
      throw new BadRequestError("Plain message");
    });

    expect((await (await app.request("/")).json()).message).toBe("Plain message");
  });
});
