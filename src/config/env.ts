import { z } from "zod";
import { createEnv, envBoolean } from "../core/config/env";

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

  // ── CACHE ─────────────────────────────────────────────────────────────
  /**
   * Cache depolama sürücüsü (bkz. shared/cache/cache.client.ts):
   *  - redis  : paylaşımlı/çok-instance varsayılan (mevcut Redis bağlantısını kullanır).
   *  - memory : süreç-içi (test/tek-instance; instance'lar arası paylaşılmaz).
   *  - null   : cache kapalı (no-op) — hata ayıklama/geçici devre dışı.
   */
  CACHE_DRIVER: z.enum(["redis", "memory", "null"]).default("redis"),
  /** TTL verilmeyen yazımların varsayılan ömrü (saniye). */
  CACHE_DEFAULT_TTL: z.coerce.number().default(300),
});

// process.env'yi şemadan geçiriyoruz. Eğer .env içinde hata varsa uygulama burada
// patlar ve HANGİ alanların neden geçersiz olduğunu tek tek listeler (bkz. core/config/env).
export const env = createEnv(envSchema, { intro: "Ortam değişkenleri geçersiz:" });