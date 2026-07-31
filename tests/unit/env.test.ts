import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  isJwtPlaceholderSecret,
  validateJwtSecret,
} from "../../src/config/jwt-secret";

// env.ts ile aynı şema parçası — JWT kurallarını process.env olmadan test eder.
import { createEnv, envBoolean } from "../../src/core/config/env";
const jwtFieldSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    JWT_SECRET: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    const err = validateJwtSecret(data.JWT_SECRET, data.NODE_ENV);
    if (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ["JWT_SECRET"] });
    }
  });

describe("JWT_SECRET doğrulama", () => {
  const validDev = "dev-local-jwt-secret-min-32-chars-ok";

  it("min 32 karakter altını reddeder", () => {
    expect(validateJwtSecret("short-secret", "development")).toMatch(/32/);
  });

  it("placeholder değerleri reddeder", () => {
    expect(isJwtPlaceholderSecret("change-me-to-a-long-random-secret")).toBe(true);
    expect(isJwtPlaceholderSecret("your-secret-key")).toBe(true);
    expect(validateJwtSecret("change-me-to-a-long-random-secret", "development")).not.toBeNull();
  });

  it("uzun rastgele benzeri değerleri kabul eder", () => {
    expect(validateJwtSecret(validDev, "development")).toBeNull();
    expect(validateJwtSecret("ci-only-secret-not-used-anywhere-else", "test")).toBeNull();
  });

  it("production'da örnek değerleri reddeder", () => {
    const longExample = "change-me-to-a-long-random-secret-extra";
    expect(validateJwtSecret(longExample, "production")).not.toBeNull();
  });

  it("env şeması ile uyumlu parse", () => {
    expect(() =>
      jwtFieldSchema.parse({ NODE_ENV: "development", JWT_SECRET: validDev })
    ).not.toThrow();
    expect(() =>
      jwtFieldSchema.parse({ NODE_ENV: "development", JWT_SECRET: "changeme" })
    ).toThrow();
  });
});

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
