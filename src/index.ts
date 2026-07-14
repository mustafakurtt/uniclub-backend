import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { sql } from "drizzle-orm";
import { env } from "./config/env";
import { db } from "./db";
import { redis } from "./shared/redis/redis.client";

import { authRoutes } from "./features/auth/auth.routes";
import { adminRoutes } from "./features/admin/admin.routes";
import { universityRoutes } from "./features/university/university.routes";
import { usersRoutes } from "./features/users/users.routes";
import { clubsRoutes } from "./features/clubs/clubs.routes";
import { notificationsRoutes } from "./features/notifications/notifications.routes";
import { auditRoutes } from "./features/audit/audit.routes";
import { moderationRoutes } from "./features/moderation/moderation.routes";
import { registerAuditSink } from "./features/audit/audit.sink";
import { errorHandler } from "./middlewares/error.middleware";
import { requestLogger } from "./middlewares/request-logger.middleware";
import { Variables, setTokenVerifier } from "./core/auth/auth.middleware";
import { configureRbac } from "./core/rbac/rbac.middleware";
import { configureTenantScope } from "./core/rbac/tenant-scope";
import { verifyToken } from "./shared/utils/jwt.util";
import { resolveAuthz } from "./shared/rbac/rbac.cache";
import { enforceAccountStatus } from "./shared/rbac/authz-policy";
import "./shared/auth/claims"; // AuthClaims declaration merging (proje claim şekli)
import "./shared/rbac/authz"; // AuthzContext declaration merging (proje authz alanları)
import { createLocaleMiddleware, type LocaleVariables } from "./core/i18n/locale";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./shared/i18n/translator";
import { verifyMailConnection, mailer } from "./shared/mail/mailer";
import { redisSubscriber } from "./shared/redis/redis.subscriber";
import { closeEmailQueue } from "./features/auth/auth.queue";
import { websocket } from "./shared/ws/bun-ws";
import { logger } from "./shared/logger/logger";
import { metrics } from "./shared/metrics/metrics";
import { createShutdownManager } from "./core/http/shutdown";

const log = logger.child({ module: "bootstrap" });

/** CORS allowlist: virgülle ayrık env → temizlenmiş dizi (boşları at). */
const CORS_ORIGINS = (env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Ana uygulamaya Variables tipini ekliyoruz.
// `app` export edilir: testler Hono'nun `app.request()` arayüzüyle tüm
// middleware zincirini gerçek port açmadan koşturur (bkz. tests/). Bir modülü
// import etmek Bun.serve'i BAŞLATMAZ — sunucu yalnızca bu dosya doğrudan
// entrypoint olarak çalıştırıldığında (default export) ayağa kalkar.
export const app = new Hono<{ Variables: Variables & LocaleVariables }>();

// Global Middlewares
// requestId EN ÖNDE: her istek bir korelasyon kimliği alır; errorHandler bunu
// istemciye döner + sunucu loguna yazar → "hata aldım" dendiğinde eşleştirilebilir.
app.use("*", requestId());
// Metrics: her isteği ölç (süre + sayaç). Erken mount → tüm alt zinciri (413/hata
// dahil) kapsar; `route` etiketi eşleşen route deseninden gelir (düşük kardinalite).
app.use("*", metrics.middleware);
// Güvenlik başlıkları (X-Content-Type-Options, X-Frame-Options, ...) tüm
// cevaplara (hata dahil) uygulansın diye erken. TLS/HSTS prod'da Caddy'de.
app.use("*", secureHeaders());
// Gövde üst sınırı: dev bir payload'a karşı erken kalkan (route'lar body okumadan).
app.use("*", bodyLimit({
  maxSize: env.MAX_BODY_BYTES,
  onError: (c) =>
    c.json(
      { success: false, message: "İstek gövdesi çok büyük.", code: "PAYLOAD_TOO_LARGE", requestId: c.get("requestId") },
      413
    ),
}));
// Dil çözümü erkenden: Accept-Language → c.get("locale"); errorHandler mesajları
// bu dile çevirir (bkz. core/i18n).
app.use("*", createLocaleMiddleware({ supported: SUPPORTED_LOCALES, fallback: DEFAULT_LOCALE }));
app.use("*", requestLogger);
// CORS: allowlist env'den (CORS_ORIGINS). Verilmezse tüm origin'lere açık (`*`) —
// dev için; PROD'da CORS_ORIGINS doldurulmalı. Kimlik Authorization'da, cookie yok.
app.use("*", cors({ origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : "*" }));

// core/auth'un token doğrulayıcısını enjekte et (SECRET env'de olduğu için core
// import edemez — dikiş). authMiddleware bunu kullanır. Bkz. core/auth/auth.middleware.
setTokenVerifier(verifyToken);

// core/rbac'a MİNİMAL sözleşmeyi enjekte et: özne kimliği + authz çözümü + resolve
// sonrası proje politikası (suspended hesabı kes). Core "suspended"i bilmez; politika
// projede (authz-policy). Bkz. core/rbac/rbac.middleware.
configureRbac({
  getSubjectId: (user) => user.userId,
  resolveAuthz,
  enforce: enforceAccountStatus,
});

// Tenant-scope AYRI opsiyonel eksen (core/rbac/tenant-scope): alan/param/bypass
// rolleri enjekte edilir. Sadece-rol/tek-tenant projeler bunu hiç çağırmaz.
configureTenantScope({
  getTenantId: (user) => user.universityId,
  paramName: "universityId",
  bypassRoles: ["super_admin", "platform_support"],
});

// guard() zincirindeki denetim izi (audit trail) kancasına bu projenin
// implementasyonunu tak — bkz. features/audit/audit.sink.ts.
registerAuditSink();

// Hata Yakalayıcı
app.onError(errorHandler);

// Health Check — READINESS kontrolü.
//
// Yalnızca "süreç ayakta mı" demek yetmez: veritabanı düşükken 200 dönersek
// load balancer bu instance'a trafik göndermeye devam eder ve kullanıcı 500 alır.
// Bağımlılıklar yoklanır; biri cevap vermiyorsa 503 döneriz ve LB bizi havuzdan çıkarır.
const HEALTH_CHECK_TIMEOUT_MS = 2000;

/** Askıda kalan bir bağımlılık, health check'i de askıda bırakmasın. */
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
};

app.get("/health", async (c) => {
  const [dbCheck, redisCheck] = await Promise.allSettled([
    withTimeout(db.execute(sql`select 1`), HEALTH_CHECK_TIMEOUT_MS),
    withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT_MS),
  ]);

  const database = dbCheck.status === "fulfilled" ? "up" : "down";
  const cache = redisCheck.status === "fulfilled" ? "up" : "down";
  const healthy = database === "up" && cache === "up";

  if (!healthy) {
    log.error({ database, cache }, "Health check başarısız — bağımlılık erişilemiyor");
  }

  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      environment: env.NODE_ENV,
      checks: { database, cache },
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
});

// Prometheus metrics exposition — Prometheus periyodik scrape eder.
// PROD: iç bilgileri sızdırır; Caddy/proxy bunu DIŞARIYA açmamalı (bkz. shared/metrics).
app.get("/metrics", metrics.handler);

// Rotaları Bağlama
app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/universities", universityRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/clubs", clubsRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/audit", auditRoutes);
app.route("/api/moderation", moderationRoutes);

// Sunucuyu başlat + graceful shutdown — YALNIZCA bu dosya doğrudan entrypoint
// iken (import.meta.main). Testler `app`'i import eder (import.meta.main false),
// bu yüzden Bun.serve/sinyal dinleyicileri kurulmaz — port açılmaz, testler
// tüm middleware zincirini `app.request()` ile portsuz koşturur.
if (import.meta.main) {
  const server = Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
    // Bun'ın native WebSocket handler'ı — upgradeWebSocket ile aynı
    // createBunWebSocket() örneğinden gelmelidir (bkz. shared/ws/bun-ws.ts).
    websocket,
  });

  log.info({ port: env.PORT }, "🚀 Sistem ayağa kalktı");

  // Graceful shutdown: SIGTERM/SIGINT'te SIRAYLA kapat — önce trafiği kes, sonra
  // bağımlılıkları. Böylece deploy'da yeni istek gelmez, uçuştaki istek biter ve
  // yarım job/bağlantı kalmaz. Kaynaklar core'a değil BURADA (proje) enjekte edilir.
  const shutdown = createShutdownManager({ logger: log, timeoutMs: 10_000 });
  shutdown.register("http-server", () => server.stop()); // yeni bağlantı yok, uçuştakini bekle
  shutdown.register("email-queue", closeEmailQueue); // worker önce (job'u bitir), sonra queue
  shutdown.register("redis-subscriber", async () => void (await redisSubscriber.quit()));
  shutdown.register("redis", async () => void (await redis.quit()));
  shutdown.register("db", () => db.$client.end({ timeout: 5 }));
  shutdown.register("mailer", () => mailer.close());
  shutdown.install();

  // SMTP erişilebilir mi? Bilgi amaçlıdır — başarısız olsa bile uygulama ÇÖKMEZ,
  // mail kuyruğu (BullMQ) gönderimi yeniden dener.
  verifyMailConnection().then((ok) => {
    if (ok) {
      log.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, "📧 SMTP bağlantısı hazır");
      log.debug("📬 Gelen kutusu (Mailpit): http://localhost:8025");
    } else {
      log.warn(
        { host: env.SMTP_HOST, port: env.SMTP_PORT },
        "⚠️  SMTP'ye ulaşılamıyor — doğrulama mailleri gönderilemez (yerelde: docker-compose up -d mailpit)"
      );
    }
  });
}