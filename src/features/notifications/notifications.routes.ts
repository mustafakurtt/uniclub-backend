import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { WSContext } from "hono/ws";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { upgradeWebSocket } from "../../shared/ws/bun-ws";
import { listNotificationsQuerySchema } from "./notifications.schema";
import { notificationsService } from "./notifications.service";
import { respondWithBusinessError } from "../../shared/utils/error.util";
import {
  addConnection,
  consumeWsTicket,
  issueWsTicket,
  markAlive,
  removeConnection,
  sendTo,
} from "./notifications.gateway";

export const notificationsRoutes = new Hono<{ Variables: Variables }>();

const statusFromError = (message: string) => (message.includes("bulunamadı") ? 404 : 400);

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
  return c.json({ success: true, message: "Bağlantı bileti üretildi.", data: { ticket, expiresIn } });
});

// 1. BİLDİRİM AKIŞI (keyset sayfalama)
notificationsRoutes.get("/", zValidator("query", listNotificationsQuerySchema), async (c) => {
  const user = c.get("user");
  const { limit, cursor } = c.req.valid("query");
  try {
    const result = await notificationsService.list(user.userId, limit, cursor);
    return c.json({ success: true, message: "Bildirimler listelendi.", data: result });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 2. OKUNMAMIŞ SAYISI (zil rozeti)
notificationsRoutes.get("/unread-count", async (c) => {
  const user = c.get("user");
  const count = await notificationsService.unreadCount(user.userId);
  return c.json({ success: true, message: "Okunmamış bildirim sayısı.", data: { count } });
});

// 3. TEK BİLDİRİMİ OKUNDU İŞARETLE
notificationsRoutes.patch("/:notificationId/read", async (c) => {
  const user = c.get("user");
  const { notificationId } = c.req.param();
  try {
    const updated = await notificationsService.markRead(user.userId, notificationId);
    return c.json({ success: true, message: "Bildirim okundu işaretlendi.", data: updated });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 4. HEPSİNİ OKUNDU İŞARETLE
notificationsRoutes.patch("/read-all", async (c) => {
  const user = c.get("user");
  const result = await notificationsService.markAllRead(user.userId);
  return c.json({ success: true, message: "Tüm bildirimler okundu işaretlendi.", data: result });
});
