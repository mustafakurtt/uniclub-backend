import { notificationsRepository } from "./notifications.repository";
import { publish } from "./notifications.gateway";
import { CreateNotificationPayload, Notification } from "./notifications.types";
import { logger } from "../../shared/logger/logger";
import { badRequest, notFound } from "../../shared/utils/errors";

const log = logger.child({ module: "notifications.service" });

export const notificationsService = {
  /**
   * Bildirimi kalıcılaştırır ve bağlı tüm cihazlara yayınlar.
   *
   * `notifySafe`'i tercih edin — bu fonksiyon hata FIRLATIR.
   */
  async notify(userId: string, payload: CreateNotificationPayload): Promise<Notification> {
    // 1. Önce DB (kalıcılık): çevrimdışı cihaz sonra bağlanınca geçmişi görsün.
    const notification = await notificationsRepository.create(userId, payload);
    // 2. Sonra fanout: her instance kendi soketlerine teslim eder.
    await publish(userId, notification);
    return notification;
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
