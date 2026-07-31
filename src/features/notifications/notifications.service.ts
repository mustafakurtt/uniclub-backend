import { notificationsRepository } from "./notifications.repository";
import { notificationMutesRepository } from "./notification-mutes.repository";
import { publish } from "./notifications.gateway";
import { webPushSender } from "./push.gateway";
import { pushSubscriptionStore } from "./push.store";
import { CreateNotificationPayload, Notification } from "./notifications.types";
import { logger } from "../../shared/logger/logger";
import { badRequest, notFound } from "../../shared/utils/errors";
import type { WebPushPayload, WebPushSubscription } from "../../core/notifications";

const log = logger.child({ module: "notifications.service" });

const DELIVERY_CHUNK = 50;

/** Bildirim data'sından kulüp bağlamını çıkarır (susturma eşlemesi için). */
function extractClubIdFromPayload(payload: CreateNotificationPayload): string | null {
  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  const clubId = data.clubId;
  return typeof clubId === "string" ? clubId : null;
}

/** Tek bildirimin WS + push teslimatı — hata yutulur (fan-out parçasında). */
async function deliverNotificationSafe(notification: Notification): Promise<void> {
  void deliverPushSafe(notification.userId, notification);
  try {
    await publish(notification.userId, notification);
  } catch (error) {
    log.warn(
      { err: error, userId: notification.userId, type: notification.type },
      "gerçek zamanlı bildirim gönderilemedi"
    );
  }
}

/** Kalıcı bildirimi küçük bir push yüküne indirger. `tag`=id → WS ile de-dup. */
function toPushPayload(n: Notification): WebPushPayload {
  return {
    title: n.title,
    body: n.body ?? undefined,
    tag: n.id,
    data: { id: n.id, type: n.type, ...(n.data ?? {}) },
  };
}

/**
 * Web push kanalı — best-effort ve BAĞIMSIZ: hatası ne WebSocket teslimatını ne de
 * asıl işlemi düşürür (notifySafe ile aynı ilke). Devre dışıysa (VAPID yok) no-op.
 */
async function deliverPushSafe(userId: string, notification: Notification): Promise<void> {
  if (!webPushSender) return;
  try {
    await webPushSender.sendToUser(userId, toPushPayload(notification));
  } catch (error) {
    log.warn({ err: error, userId, type: notification.type }, "web push gönderilemedi");
  }
}

export const notificationsService = {
  /**
   * Bildirimi kalıcılaştırır ve bağlı tüm cihazlara yayınlar.
   *
   * `notifySafe`'i tercih edin — bu fonksiyon hata FIRLATIR.
   */
  async notify(userId: string, payload: CreateNotificationPayload): Promise<Notification | null> {
    const clubId = extractClubIdFromPayload(payload);
    const muted = await notificationMutesRepository.findMutedUserIds([userId], payload.type, clubId);
    if (muted.has(userId)) return null;

    // 1. Önce DB (kalıcılık): çevrimdışı cihaz sonra bağlanınca geçmişi görsün.
    const notification = await notificationsRepository.add(userId, payload);
    // 2. Web push'ı ERKEN ve fire-and-forget başlat: WS/Redis'ten BAĞIMSIZDIR
    //    (kapalı uygulamanın kanalı). publish (Redis) düşse bile push gitmiş olur.
    void deliverPushSafe(userId, notification);
    // 3. WebSocket fanout: her instance kendi (açık) soketlerine teslim eder.
    //    İKİLİ TESLİMAT: hem WS hem push gider; çift-bildirimi service worker önler
    //    (odaklı pencere varsa OS bildirimini bastırır, `tag`=id ile de-dup). Bkz.
    //    docs/architecture/notifications.md → "Service Worker sözleşmesi".
    await publish(userId, notification);
    return notification;
  },

  /** Bir cihazın push aboneliğini kaydeder/tazeler (self-service). */
  async subscribePush(userId: string, subscription: WebPushSubscription): Promise<void> {
    await pushSubscriptionStore.save(userId, subscription);
  },

  /** Bir cihazın push aboneliğini siler (kullanıcı çıkışı / bildirimi kapatma). */
  async unsubscribePush(endpoint: string): Promise<void> {
    await pushSubscriptionStore.removeByEndpoints([endpoint]);
  },

  /**
   * `notify`'ın yutan (swallowing) hâli — İŞ AKIŞLARINDA BUNU KULLANIN.
   *
   * Bir kulüp başvurusunun onaylanması, bildirim gönderilemedi diye başarısız
   * OLMAMALIDIR. Bildirim yan etkidir; asıl işlemin doğruluğunu etkilemez.
   * Hata loglanır ve yutulur.
   */
  async notifySafe(userId: string, payload: CreateNotificationPayload): Promise<void> {
    try {
      await notificationsService.notify(userId, payload);
    } catch (error) {
      log.warn({ err: error, userId, type: payload.type }, "bildirim gönderilemedi");
    }
  },

  /**
   * Çok alıcıya aynı bildirim — tek (parçalı) INSERT + teslimat parçaları.
   * `notifySafe` ile aynı swallowing ilkesi.
   */
  async notifyManySafe(userIds: string[], payload: CreateNotificationPayload): Promise<void> {
    if (userIds.length === 0) return;
    try {
      const clubId = extractClubIdFromPayload(payload);
      const muted = await notificationMutesRepository.findMutedUserIds(
        userIds,
        payload.type,
        clubId
      );
      const recipients = userIds.filter((id) => !muted.has(id));
      if (recipients.length === 0) return;

      const rows = await notificationsRepository.addMany(recipients, payload);
      for (let i = 0; i < rows.length; i += DELIVERY_CHUNK) {
        const chunk = rows.slice(i, i + DELIVERY_CHUNK);
        await Promise.all(chunk.map((notification) => deliverNotificationSafe(notification)));
      }
    } catch (error) {
      log.warn(
        { err: error, recipientCount: userIds.length, type: payload.type },
        "toplu bildirim gönderilemedi"
      );
    }
  },

  async list(userId: string, limit: number, cursor?: string) {
    const cursorDate = cursor ? new Date(cursor) : undefined;
    if (cursorDate && Number.isNaN(cursorDate.getTime())) {
      throw badRequest("notification.invalidCursor");
    }
    const items = await notificationsRepository.listByUser(userId, limit, cursorDate);
    // Bir sonraki sayfanın cursor'ı: son satırın createdAt'i. Sayfa dolmadıysa son sayfadayız.
    const nextCursor = items.length === limit ? items[items.length - 1].createdAt.toISOString() : null;
    return { items, nextCursor };
  },

  async unreadCount(userId: string) {
    return await notificationsRepository.countUnread(userId);
  },

  async markRead(userId: string, notificationId: string) {
    const updated = await notificationsRepository.markRead(userId, notificationId);
    if (!updated) {
      // Başkasının bildirimi ya da hiç yok — ikisini de aynı şekilde cevaplıyoruz
      // ki id tahminiyle başkasının bildiriminin varlığı öğrenilemesin.
      throw notFound("notification.notFound");
    }
    return updated;
  },

  async markAllRead(userId: string) {
    const count = await notificationsRepository.markAllRead(userId);
    return { updated: count };
  },
};
