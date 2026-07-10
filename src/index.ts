import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { env } from "./config/env";

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
import { verifyMailConnection } from "./shared/mail/mailer";
import { websocket } from "./shared/ws/bun-ws";
import { logger } from "./shared/logger/logger";

const log = logger.child({ module: "bootstrap" });

// Ana uygulamaya Variables tipini ekliyoruz
const app = new Hono<{ Variables: Variables }>();

// Global Middlewares
// requestId EN ÖNDE: her istek bir korelasyon kimliği alır; errorHandler bunu
// istemciye döner + sunucu loguna yazar → "hata aldım" dendiğinde eşleştirilebilir.
app.use("*", requestId());
app.use("*", requestLogger);
app.use("*", cors());

// guard() zincirindeki denetim izi (audit trail) kancasına bu projenin
// implementasyonunu tak — bkz. features/audit/audit.sink.ts.
registerAuditSink();

// Hata Yakalayıcı
app.onError(errorHandler);

// Health Check
app.get("/health", (c) => {
  return c.json({ 
    status: "ok",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
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