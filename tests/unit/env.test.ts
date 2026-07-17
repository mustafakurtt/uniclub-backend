import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createEnv, envBoolean } from "../../src/core/config/env";

/** core/config birim testleri — process.env'e DOKUNMADAN (source enjekte edilir). */

describe("createEnv", () => {
  const schema = z.object({
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url("Geçerli bir veritabanı URL'si girilmelidir."),
  });

  it("geçerli ortamı parse eder ve tipler", () => {
    const env = createEnv(schema, { source: { PORT: "8080", DATABASE_URL: "postgres://a/b" } });
    expect(env).toEqual({ PORT: 8080, DATABASE_URL: "postgres://a/b" });
  });

  it("varsayılanları uygular", () => {
    expect(createEnv(schema, { source: { DATABASE_URL: "postgres://a/b" } }).PORT).toBe(3000);
  });

  it("geçersizse FIRLATIR ve hangi alan/neden olduğunu tek tek listeler", () => {
    // Ham schema.parse() çıktısının aksine okunur olması bu fabrikanın varlık sebebi.
    expect(() => createEnv(schema, { source: { DATABASE_URL: "url-değil" } })).toThrow(
      /DATABASE_URL: Geçerli bir veritabanı URL'si girilmelidir\./
    );
  });

  it("birden çok hatayı birlikte listeler (tek tek uğraştırmaz)", () => {
    const strict = z.object({ A: z.string(), B: z.string() });
    try {
      createEnv(strict, { source: {} });
      expect.unreachable("fırlatmalıydı");
    } catch (err) {
      expect((err as Error).message).toContain("A:");
      expect((err as Error).message).toContain("B:");
    }
  });

  it("hata başlığı projeden gelir (core dil bilmez)", () => {
    expect(() => createEnv(schema, { source: {}, intro: "Ortam değişkenleri geçersiz:" })).toThrow(
      /Ortam değişkenleri geçersiz:/
    );
  });
});

describe("envBoolean", () => {
  const parse = (raw: string | undefined, fallback = false) =>
    z.object({ FLAG: envBoolean(fallback) }).parse(raw === undefined ? {} : { FLAG: raw }).FLAG;

  it('KRİTİK: "false" gerçekten false olur', () => {
    // z.coerce.boolean() burada true verirdi (Boolean("false") === true) — bu
    // yardımcının bütün varlık sebebi bu tuzak.
    expect(parse("false")).toBe(false);
  });

  it("bilinen doğruluk değerlerini kabul eder", () => {
    for (const truthy of ["1", "true", "yes", "on", "TRUE", " True "]) {
      expect(parse(truthy)).toBe(true);
    }
    for (const falsy of ["0", "no", "off", "hiçbiri"]) {
      expect(parse(falsy)).toBe(false);
    }
  });

  it("tanımsız/boş değerde varsayılana düşer", () => {
    expect(parse(undefined, true)).toBe(true);
    expect(parse("", true)).toBe(true);
    expect(parse("   ", false)).toBe(false);
  });
});
