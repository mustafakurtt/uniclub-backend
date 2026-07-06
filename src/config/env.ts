import { z } from "zod";

/**
 * Ortam değişkenleri her zaman STRING'dir. `z.coerce.boolean()` burada
 * KULLANILAMAZ: Boolean("false") === true olduğu için "false" yazan herkes
 * sessizce true alır. Bu yardımcı yalnızca bilinen doğruluk değerlerini kabul eder.
 */
const envBoolean = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw.trim() === "") return defaultValue;
      return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
    });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url("Geçerli bir veritabanı URL'si girilmelidir."),
  REDIS_URL: z.string().url("Geçerli bir Redis URL'si girilmelidir."),
  JWT_SECRET: z.string().min(10, "JWT secret çok kısa olamaz!"),

  // ── E-POSTA (doğrulama maili) ────────────────────────────────────────────
  // Yerelde docker-compose'daki Mailpit'e bağlanır (SMTP :1025, arayüz :8025).
  // Gerçek bir sağlayıcıya geçerken yalnızca bu değerler değişir; kod aynı kalır.
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: envBoolean(false), // 465 kullanıyorsan true
  SMTP_USER: z.string().optional(),               // Mailpit istemez; prod'da zorunlu
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Kampüs Kulüp Sistemi <no-reply@kampus.local>"),

  /** Doğrulama linkinin tabanı. Mail içindeki link buradan üretilir. */
  APP_URL: z.string().url("Geçerli bir uygulama URL'si girilmelidir.").default("http://localhost:3000"),

  // ── HIZ SINIRI (rate limit) ──────────────────────────────────────────────
  /** Test/CI'da limitleri kapatmak için. Prod'da ASLA true olmamalı. */
  RATE_LIMIT_DISABLED: envBoolean(false),
  /**
   * Uygulama bir ters proxy (nginx, Cloudflare, load balancer) arkasındaysa true.
   * true iken istemci IP'si X-Forwarded-For'un İLK girdisinden okunur.
   * DİKKAT: proxy arkasında DEĞİLKEN true yapmak IP sahteciliğine (spoofing) açar —
   * istemci başlığı kendisi uydurabilir.
   */
  TRUST_PROXY: envBoolean(false),

  // ── LOGLAMA ───────────────────────────────────────────────────────────
  /** Verilmezse shared/logger.ts, NODE_ENV'e göre karar verir (prod: info, aksi: debug). */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
});

// process.env'yi şemadan geçiriyoruz. 
// Eğer .env içinde hata varsa uygulama burada patlar ve sana nerenin eksik olduğunu söyler.
export const env = envSchema.parse(process.env);