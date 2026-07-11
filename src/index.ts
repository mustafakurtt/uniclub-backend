import { Hono } from "hono";
import { cors } from "hono/cors";
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
import { registerAuditSink } from "./features/audit/audit.sink";
import { errorHandler } from "./middlewares/error.middleware";
import { requestLogger } from "./middlewares/request-logger.middleware";
import { Variables } from "./core/auth/auth.middleware";
import { createLocaleMiddleware, type LocaleVariables } from "./core/i18n/locale";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./shared/i18n/translator";
import { verifyMailConnection } from "./shared/mail/mailer";
import { websocket } from "./shared/ws/bun-ws";
import { logger } from "./shared/logger/logger";

const log = logger.child({ module: "bootstrap" });

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
// Dil çözümü erkenden: Accept-Language → c.get("locale"); errorHandler mesajları
// bu dile çevirir (bkz. core/i18n).
app.use("*", createLocaleMiddleware({ supported: SUPPORTED_LOCALES, fallback: DEFAULT_LOCALE }));
app.use("*", requestLogger);
app.use("*", cors());

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

// Rotaları Bağlama
app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/universities", universityRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/clubs", clubsRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/audit", auditRoutes);

export default {
  port: env.PORT,
  fetch: app.fetch,
  // Bun'ın native WebSocket handler'ı. `upgradeWebSocket` ile aynı
  // createBunWebSocket() örneğinden gelmelidir (bkz. shared/ws/bun-ws.ts).
  websocket,
};

log.info({ port: env.PORT }, "🚀 Sistem ayağa kalktı");

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