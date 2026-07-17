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
  /**
   * Verilirse loglar stdout'a EK OLARAK bu dosyaya da (ham JSON) yazılır; bir
   * log-toplayıcı ajanı (promtail, fluent-bit, datadog-agent) dosyayı tail'ler.
   * Verilmezse yalnızca stdout'a yazılır — konteyner/12-factor varsayılanı, platform
   * (Docker/k8s log driver) logları toplar. Bkz. shared/logger/logger.ts.
   */
  LOG_FILE: z.string().optional(),

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

  // ── GÜVENLİK / HTTP SINIRLARI ────────────────────────────────────────────
  /**
   * İzin verilen CORS origin'leri (virgülle ayrık, ör.
   * "https://uniclub.test,https://app.uniclub.test"). Verilmezse tüm origin'lere
   * açık (`*`) — dev için pratik; PROD'da mutlaka doldurulmalı. Kimlik
   * Authorization başlığında taşındığı için credentials/cookie gerekmez.
   */
  CORS_ORIGINS: z.string().optional(),
  /**
   * İstek gövdesi üst sınırı (byte). Aşılırsa 413 döner — dev bir payload ile
   * bellek/DoS'a karşı ucuz kalkan. JSON gövdeleri için; dosya YÜKLEME rotası
   * (`/api/uploads`) bu global sınırdan MUAFTIR ve kendi `MAX_UPLOAD_BYTES`'ını
   * uygular (bkz. index.ts + features/media). 1MB JSON'a bol.
   */
  MAX_BODY_BYTES: z.coerce.number().default(1_048_576),

  // ── MEDYA / DOSYA YÜKLEME ─────────────────────────────────────────────────
  /**
   * Depolama sürücüsü (bkz. shared/storage/storage.client.ts):
   *  - local  : yerel disk (UPLOAD_DIR) — self-host varsayılanı.
   *  - memory : süreç-içi (test; diske yazmaz).
   * İleride s3 adaptörü eklense yalnızca bu ve birkaç env değişir, kod aynı kalır.
   */
  STORAGE_DRIVER: z.enum(["local", "memory"]).default("local"),
  /** local sürücüde dosyaların yazılacağı dizin (repo köküne göre). .gitignore'da. */
  UPLOAD_DIR: z.string().default("./uploads"),
  /** Tek dosya üst sınırı (byte). Upload rotası bunu uygular (global MAX_BODY_BYTES değil). */
  MAX_UPLOAD_BYTES: z.coerce.number().default(5_242_880), // 5 MB
  /**
   * Sunulan dosya URL'lerinin tabanı. Verilmezse relatif `/uploads/<key>` döner
   * (frontend API tabanına göre çözer). Bir CDN/ayrı host varsa mutlak URL verin
   * (ör. "https://cdn.uniclub.test").
   */
  UPLOAD_PUBLIC_BASE_URL: z.string().optional(),

  // ── WEB PUSH (VAPID) ──────────────────────────────────────────────────────
  /**
   * Web Push (VAPID) anahtarları. PUBLIC + PRIVATE'in İKİSİ de verilmezse web push
   * GRACEFUL biçimde devre dışı kalır (WebSocket etkilenmez). Üret:
   *   bunx web-push generate-vapid-keys
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** Push servislerinin iletişim için istediği kimlik (mailto: veya https:). */
  VAPID_SUBJECT: z.string().default("mailto:admin@uniclub.local"),
});

// process.env'yi şemadan geçiriyoruz. Eğer .env içinde hata varsa uygulama burada
// patlar ve HANGİ alanların neden geçersiz olduğunu tek tek listeler (bkz. core/config/env).
export const env = createEnv(envSchema, { intro: "Ortam değişkenleri geçersiz:" });