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
import { activitiesRoutes } from "./features/activities/activities.routes";
import { feedRoutes } from "./features/dashboard/dashboard.routes";
import { mediaRoutes, mediaServeRoutes } from "./features/media/media.routes";
import { notificationsRoutes } from "./features/notifications/notifications.routes";
import { auditRoutes } from "./features/audit/audit.routes";
import { moderationRoutes } from "./features/moderation/moderation.routes";
import { platformRoutes } from "./features/platform/platform.routes";
import { publicRoutes } from "./features/public/public.routes";
import { registerAuditSink } from "./features/audit/audit.sink";
import { errorHandler } from "./middlewares/error.middleware";
import { requestLogger } from "./middlewares/request-logger.middleware";
import { Variables, setTokenVerifier } from "./core/auth/auth.middleware";
import { configureRbac } from "./core/rbac/rbac.middleware";
import { configureTenantScope } from "./core/rbac/tenant-scope";
import { verifyToken } from "./shared/utils/jwt.util";
import { resolveAuthz } from "./shared/rbac/rbac.cache";
import { enforceAuthzPolicy } from "./shared/rbac/authz-policy";
import "./shared/auth/claims"; // AuthClaims declaration merging (proje claim şekli)
import "./shared/rbac/authz"; // AuthzContext declaration merging (proje authz alanları)
import { createAppLocaleMiddleware } from "./middlewares/app-locale.middleware";
import { optionalAuthMiddleware } from "./middlewares/optional-auth.middleware";
import type { LocaleVariables } from "./core/i18n/locale";
import { verifyMailConnection, mailer } from "./shared/mail/mailer";
import { redisSubscriber } from "./shared/redis/redis.subscriber";
import { closeEmailQueue } from "./features/auth/auth.queue";
import { closeNotificationFanoutQueue } from "./features/notifications/notifications.fanout";
import { closeScheduledPublishQueue } from "./shared/publishing/scheduled-publish.queue";
import {
  reconcileScheduledPublishes,
  SCHEDULED_PUBLISH_RECONCILE_INTERVAL_MS,
} from "./shared/publishing/scheduled-publish.reconcile";
import { websocket } from "./shared/ws/bun-ws";
import { logger } from "./shared/logger/logger";
import { metrics } from "./shared/metrics/metrics";
import { createShutdownManager } from "./core/http/shutdown";
import { createHealth } from "./core/http/health";
import { ensureMigrationsAtStartup } from "./db/migration-check";

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
// Dosya YÜKLEME rotası (`/api/uploads`) bu global JSON sınırından MUAFTIR — kendi
// (daha büyük) MAX_UPLOAD_BYTES'ını uygular (bkz. features/media/media.routes.ts).
const globalBodyLimit = bodyLimit({
  maxSize: env.MAX_BODY_BYTES,
  onError: (c) =>
    c.json(
      { success: false, message: "İstek gövdesi çok büyük.", code: "PAYLOAD_TOO_LARGE", requestId: c.get("requestId") },
      413
    ),
});
app.use("*", (c, next) =>
  c.req.path.startsWith("/api/uploads") ? next() : globalBodyLimit(c, next)
);
// Dil: isteğe bağlı auth → kullanıcı tercihi → Accept-Language → tenant varsayılanı → tr.
app.use("*", optionalAuthMiddleware);
app.use("*", createAppLocaleMiddleware());
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
  enforce: enforceAuthzPolicy,
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
//
// Mekanizma (zaman aşımı, paralel koşma, drain) core/http/health.ts'te; NEYİN
// kontrol edileceği ve cevabın ŞEKLİ burada — core proje sözleşmesini bilmez.
const health = createHealth({
  checks: [
    { name: "database", run: async () => void (await db.execute(sql`select 1`)) },
    { name: "cache", run: async () => void (await redis.ping()) },
  ],
  timeoutMs: 2000,
});

app.get("/health", async (c) => {
  const report = await health.report();
  // Cevap şekli DEĞİŞMEDİ (istemciler/testler bağlı): status ok|degraded ve
  // checks bir NESNE. core'un ham raporu bu sözleşmeye burada uyarlanır.
  const checks = Object.fromEntries(report.checks.map((check) => [check.name, check.status]));
  const healthy = report.status === "up";

  if (!healthy) {
    log.error({ ...checks, draining: report.draining }, "Health check başarısız — bağımlılık erişilemiyor");
  }

  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      environment: env.NODE_ENV,
      checks,
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
});

/**
 * LIVENESS — "süreç yaşıyor mu?" Bağımlılıklara BAKMAZ ve kapanış draini
 * sırasında bile 200 döner. Ayrı bir uç olmasının sebebi: `/health` bağımlılık
 * yoklar ve orkestratör (Docker HEALTHCHECK / k8s livenessProbe) ona bakarsa,
 * bir veritabanı kesintisi tüm konteynerlerin yeniden başlatılmasına yol açar —
 * kesintiyi düzeltmez, büyütür. Yeniden başlatma kararı BUNA bakmalı.
 */
app.get("/live", health.live);

// Prometheus metrics exposition — Prometheus periyodik scrape eder.
// PROD: iç bilgileri sızdırır; Caddy/proxy bunu DIŞARIYA açmamalı (bkz. shared/metrics).
app.get("/metrics", metrics.handler);

// Rotaları Bağlama
app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/universities", universityRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/clubs", clubsRoutes);
app.route("/api/activities", activitiesRoutes);
app.route("/api/feed", feedRoutes);
app.route("/api/uploads", mediaRoutes);
// Yüklenen dosyaların PUBLIC servisi (auth yok; /api altında DEĞİL).
app.route("/uploads", mediaServeRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/audit", auditRoutes);
app.route("/api/moderation", moderationRoutes);
app.route("/api/platform", platformRoutes);
app.route("/api/public", publicRoutes);

// Sunucuyu başlat + graceful shutdown — YALNIZCA bu dosya doğrudan entrypoint
// iken (import.meta.main). Testler `app`'i import eder (import.meta.main false),
// bu yüzden Bun.serve/sinyal dinleyicileri kurulmaz — port açılmaz, testler
// tüm middleware zincirini `app.request()` ile portsuz koşturur.
if (import.meta.main) {
  await ensureMigrationsAtStartup({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    logger: log,
  });

  const server = Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
    // Bun'ın native WebSocket handler'ı — upgradeWebSocket ile aynı
    // createBunWebSocket() örneğinden gelmelidir (bkz. shared/ws/bun-ws.ts).
    websocket,
  });

  log.info({ port: env.PORT }, "🚀 Sistem ayağa kalktı");

  // Zamanlanmış yayın mutabakatı — açılışı bloklamaz (fail-open).
  reconcileScheduledPublishes().catch((err) =>
    log.warn({ err }, "açılış zamanlanmış yayın mutabakatı atlandı")
  );
  const reconcileTimer = setInterval(() => {
    reconcileScheduledPublishes().catch((err) =>
      log.warn({ err }, "periyodik zamanlanmış yayın mutabakatı atlandı")
    );
  }, SCHEDULED_PUBLISH_RECONCILE_INTERVAL_MS);

  // Graceful shutdown: SIGTERM/SIGINT'te SIRAYLA kapat — önce trafiği kes, sonra
  // bağımlılıkları. Böylece deploy'da yeni istek gelmez, uçuştaki istek biter ve
  // yarım job/bağlantı kalmaz. Kaynaklar core'a değil BURADA (proje) enjekte edilir.
  const shutdown = createShutdownManager({ logger: log, timeoutMs: 10_000 });
  // DRAIN İLK SIRADA: /health'i 503'e çevirip yük dengeleyicinin bizi havuzdan
  // çıkarmasını bekler. Bu adım olmadan sunucuyu kapatmak, LB'nin henüz haberi
  // olmadığı için o sırada yönlendirilen isteklere bağlantı hatası verdirir.
  // Prod'da varsayılan 5sn; yerelde 0 (Ctrl+C anında çıksın). HEALTH_DRAIN_MS ezer.
  const drainMs = env.HEALTH_DRAIN_MS ?? (env.NODE_ENV === "production" ? 5_000 : 0);
  shutdown.register("drain", health.drainTask(drainMs));
  shutdown.register("http-server", () => server.stop()); // yeni bağlantı yok, uçuştakini bekle
  shutdown.register("email-queue", closeEmailQueue); // worker önce (job'u bitir), sonra queue
  shutdown.register("notification-fanout-queue", closeNotificationFanoutQueue);
  shutdown.register("scheduled-publish-queue", closeScheduledPublishQueue);
  shutdown.register("scheduled-publish-reconcile", async () => clearInterval(reconcileTimer));
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