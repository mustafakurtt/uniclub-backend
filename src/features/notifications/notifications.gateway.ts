import type { WSContext } from "hono/ws";
import { redis } from "../../shared/redis/redis.client";
import { redisSubscriber } from "../../shared/redis/redis.subscriber";
import { Notification, ServerEvent } from "./notifications.types";
import { logger } from "../../shared/logger/logger";

const log = logger.child({ module: "notifications.ws" });

/**
 * Gerçek zamanlı teslimat katmanı.
 *
 * ┌── instance A ──┐                          ┌── instance B ──┐
 * │ soketler(user) │◄── Redis Pub/Sub ───────►│ soketler(user) │
 * └────────────────┘   kanal: "notifications" └────────────────┘
 *
 * Bir kullanıcının soketleri yalnızca ONA hizmet eden instance'ın belleğindedir.
 * Yatay ölçeklemede (birden çok sunucu) bildirimi üreten instance, kullanıcının
 * bağlı olduğu instance OLMAYABİLİR. Bu yüzden teslimat her zaman Redis üzerinden
 * yayınlanır; her instance abone olup KENDİ soketlerine yazar. Yayınlayan instance
 * de abonedir → tek bir kod yolu, "yerel mi uzak mı" ayrımı yok.
 */

const CHANNEL = "notifications";

/** Bir kullanıcının AYNI ANDA bağlı tüm cihazları (telefon + laptop + ...). */
const connections = new Map<string, Set<WSContext>>();

/** Son "pong" zamanı. WeakMap: soket kapanınca kayıt kendiliğinden düşer. */
const lastSeen = new WeakMap<WSContext, number>();

const HEARTBEAT_INTERVAL_MS = 30_000;
/** 3 ping kaçıran bağlantı ölü sayılır (yarı-açık TCP bağlantılarını temizler). */
const HEARTBEAT_TIMEOUT_MS = 90_000;

// ════════════════════════════════════════════════════════════
// BAĞLANTI KAYDI
// ════════════════════════════════════════════════════════════

export function addConnection(userId: string, ws: WSContext) {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(ws);
  lastSeen.set(ws, Date.now());
}

export function removeConnection(userId: string, ws: WSContext) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  // Boş Set'i Map'te bırakmak yavaş bir bellek sızıntısıdır.
  if (set.size === 0) connections.delete(userId);
}

export function markAlive(ws: WSContext) {
  lastSeen.set(ws, Date.now());
}

/** Test/teşhis amaçlı: bu instance'a bağlı soket sayısı. */
export function connectionCount(userId: string): number {
  return connections.get(userId)?.size ?? 0;
}

function send(ws: WSContext, event: ServerEvent) {
  try {
    ws.send(JSON.stringify(event));
  } catch (error) {
    // Soket kapanmış olabilir; teslimat hatası çağıranı ilgilendirmez.
    log.warn({ err: error }, "mesaj gönderilemedi");
  }
}

export function sendTo(ws: WSContext, event: ServerEvent) {
  send(ws, event);
}

/** Bu instance'daki, o kullanıcıya ait TÜM soketlere yazar. */
function deliverLocal(userId: string, event: ServerEvent) {
  const set = connections.get(userId);
  if (!set || set.size === 0) return;
  for (const ws of set) send(ws, event);
}

// ════════════════════════════════════════════════════════════
// FANOUT (Redis Pub/Sub)
// ════════════════════════════════════════════════════════════

interface FanoutMessage {
  userId: string;
  notification: Notification;
}

/** Bildirimi tüm instance'lara yayınlar. `notificationsService.notify` çağırır. */
export async function publish(userId: string, notification: Notification) {
  const message: FanoutMessage = { userId, notification };
  await redis.publish(CHANNEL, JSON.stringify(message));
}

// Modül yüklenirken tek sefer abone ol.
redisSubscriber.subscribe(CHANNEL).catch((err) => {
  log.error({ err, channel: CHANNEL }, "kanala abone olunamadı");
});

redisSubscriber.on("message", (channel, raw) => {
  if (channel !== CHANNEL) return;
  try {
    const { userId, notification } = JSON.parse(raw) as FanoutMessage;
    deliverLocal(userId, { event: "notification", data: notification });
  } catch (error) {
    log.warn({ err: error }, "bozuk fanout mesajı yok sayıldı");
  }
});

// ════════════════════════════════════════════════════════════
// HEARTBEAT — yarı-açık bağlantıları temizler
// ════════════════════════════════════════════════════════════
// TCP, kablosu çekilmiş bir istemciyi hemen fark etmez; soket "açık" görünmeye
// devam eder ve bellekte birikir. Düzenli ping + pong takibi bunları ayıklar.

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const [userId, set] of connections) {
    for (const ws of set) {
      const seen = lastSeen.get(ws) ?? 0;
      if (now - seen > HEARTBEAT_TIMEOUT_MS) {
        try {
          ws.close(1001, "heartbeat timeout");
        } catch {
          /* zaten kapalı */
        }
        removeConnection(userId, ws);
        continue;
      }
      send(ws, { event: "ping" });
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// `bun --hot` yeniden yüklerken eski interval'ın process'i canlı tutmasını engelle.
heartbeat.unref?.();

// ════════════════════════════════════════════════════════════
// WS TICKET — handshake kimlik doğrulaması
// ════════════════════════════════════════════════════════════
// WebSocket handshake'i özel header (Authorization) taşıyamaz. JWT'yi query
// string'e koymak onu access log'lara, proxy loglarına ve tarayıcı geçmişine
// sızdırır. Bunun yerine kısa ömürlü, TEK KULLANIMLIK bir ticket veriyoruz.

const TICKET_TTL_SECONDS = 60;
const ticketKey = (ticket: string) => `ws:ticket:${ticket}`;

export async function issueWsTicket(userId: string): Promise<{ ticket: string; expiresIn: number }> {
  const ticket = crypto.randomUUID();
  await redis.set(ticketKey(ticket), userId, "EX", TICKET_TTL_SECONDS);
  return { ticket, expiresIn: TICKET_TTL_SECONDS };
}

/** Ticket'ı ATOMİK olarak tüketir (GETDEL) → tekrar kullanılamaz. */
export async function consumeWsTicket(ticket: string): Promise<string | null> {
  return await redis.getdel(ticketKey(ticket));
}
