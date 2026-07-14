import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { upgradeWebSocket } from "../../shared/ws/bun-ws";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import {
  listNotificationsQuerySchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from "./notifications.schema";
import { notificationsService } from "./notifications.service";
import { isPushEnabled, webPushSender } from "./push.gateway";
import {
  addConnection,
  consumeWsTicket,
  issueWsTicket,
  markAlive,
  removeConnection,
  sendTo,
} from "./notifications.gateway";

export const notificationsRoutes = new Hono<{ Variables: Variables }>();

/**
 * ⚠️ SIRA ÖNEMLİ: WS rotası, aşağıdaki `use("*", authMiddleware, ...)` zincirinden
 * ÖNCE tanımlanır. WebSocket handshake'i `Authorization` header'ı taşıyamadığı için
 * authMiddleware onu 401'le reddederdi. Kimlik doğrulaması ticket ile yapılır.
 */
notificationsRoutes.get(
  "/ws",
  upgradeWebSocket((c) => {
    // Bu değişkenler bağlantı ömrü boyunca (onOpen → onClose) yaşar.
    let userId: string | null = null;

    return {
      async onOpen(_evt, ws: WSContext) {
        const ticket = c.req.query("ticket");
        if (!ticket) {
          ws.close(4401, "ticket gerekli");
          return;
        }

        // GETDEL: ticket tek kullanımlıktır, aynısıyla ikinci bağlantı açılamaz.
        const resolvedUserId = await consumeWsTicket(ticket);
        if (!resolvedUserId) {
          ws.close(4401, "gecersiz veya kullanilmis ticket");
          return;
        }

        userId = resolvedUserId;
        addConnection(userId, ws);
        sendTo(ws, { event: "ready", data: { userId } });
      },

      onMessage(evt, ws: WSContext) {
        // Tek beklenen istemci mesajı: heartbeat cevabı.
        if (typeof evt.data === "string" && evt.data === "pong") {
          markAlive(ws);
        }
      },

      onClose(_evt, ws: WSContext) {
        if (userId) removeConnection(userId, ws);
      },

      onError(_evt, ws: WSContext) {
        if (userId) removeConnection(userId, ws);
      },
    };
  })
);

// Buradan aşağısı normal REST — giriş şart, askıya alınmış kullanıcı kesilir.
// (Doğrulanmamış `pending` kullanıcı BİLDİRİMLERİNİ GÖREBİLİR: zaten
// "hesabını doğrula" bildirimini okuması gerekiyor.)
notificationsRoutes.use("*", authMiddleware, requireActiveUser);

/**
 * WS bağlantısı için kısa ömürlü (60sn), tek kullanımlık ticket üretir.
 * Frontend: önce bunu çağır, sonra `GET /api/notifications/ws?ticket=<ticket>`.
 */
notificationsRoutes.post("/ws-ticket", async (c) => {
  const user = c.get("user");
  const { ticket, expiresIn } = await issueWsTicket(user.userId);
  return ok(c, { ticket, expiresIn }, "notification.wsTicketIssued");
});

// Not: rotalar bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
// fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.

// 1. BİLDİRİM AKIŞI (keyset sayfalama)
notificationsRoutes.get("/", validate("query", listNotificationsQuerySchema), async (c) => {
  const user = c.get("user");
  const { limit, cursor } = c.req.valid("query");
  const result = await notificationsService.list(user.userId, limit, cursor);
  return ok(c, result, "notification.listed");
});

// 2. OKUNMAMIŞ SAYISI (zil rozeti)
notificationsRoutes.get("/unread-count", async (c) => {
  const user = c.get("user");
  const count = await notificationsService.unreadCount(user.userId);
  return ok(c, { count }, "notification.unreadCount");
});

// 3. TEK BİLDİRİMİ OKUNDU İŞARETLE
notificationsRoutes.patch("/:notificationId/read", async (c) => {
  const user = c.get("user");
  const { notificationId } = c.req.param();
  const updated = await notificationsService.markRead(user.userId, notificationId);
  return ok(c, updated, "notification.markedRead");
});

// 4. HEPSİNİ OKUNDU İŞARETLE
notificationsRoutes.patch("/read-all", async (c) => {
  const user = c.get("user");
  const result = await notificationsService.markAllRead(user.userId);
  return ok(c, result, "notification.allMarkedRead");
});

// ── WEB PUSH (WebSocket'in tamamlayıcısı — uygulama kapalıyken teslimat) ──

// 5. VAPID PUBLIC ANAHTARI — istemci `pushManager.subscribe` için ihtiyaç duyar.
//    `enabled:false` ise sunucuda VAPID yok → istemci abone OLMAMALI.
notificationsRoutes.get("/push-key", (c) =>
  ok(c, { enabled: isPushEnabled, publicKey: webPushSender?.publicKey ?? null }, "notification.pushKey")
);

// 6. PUSH ABONELİĞİ KAYDET (bu cihazı bildirimlere kaydeder — endpoint'e göre upsert).
notificationsRoutes.post("/push-subscribe", validate("json", pushSubscribeSchema), async (c) => {
  const user = c.get("user");
  const subscription = c.req.valid("json");
  await notificationsService.subscribePush(user.userId, subscription);
  return ok(c, { subscribed: true }, "notification.pushSubscribed");
});

// 7. PUSH ABONELİĞİNDEN ÇIK (bu cihazı siler).
notificationsRoutes.delete("/push-subscribe", validate("json", pushUnsubscribeSchema), async (c) => {
  const { endpoint } = c.req.valid("json");
  await notificationsService.unsubscribePush(endpoint);
  return ok(c, { unsubscribed: true }, "notification.pushUnsubscribed");
});
