import { defineCatalog } from "../../core/i18n/translator";

/**
 * notifications feature'ının kullanıcı-cephesi mesajları (REST kısmı), feature
 * içinde — aynı `*.permissions.ts` konvansiyonu. WS kapanış sebepleri
 * (`ws.close(4401, "...")`) bilinçli olarak KAPSAM DIŞI: protokol seviyesi
 * string'ler, JSON zarfı değil. Kompozisyon kökü shared/i18n/messages.ts bunu
 * mergeCatalogs ile birleştirir.
 */
export const notificationsMessages = defineCatalog({
  tr: {
    // hata
    "notification.invalidCursor": "Geçersiz cursor değeri.",
    "notification.notFound": "Bildirim bulunamadı.",
    // başarı
    "notification.wsTicketIssued": "Bağlantı bileti üretildi.",
    "notification.listed": "Bildirimler listelendi.",
    "notification.unreadCount": "Okunmamış bildirim sayısı.",
    "notification.markedRead": "Bildirim okundu işaretlendi.",
    "notification.allMarkedRead": "Tüm bildirimler okundu işaretlendi.",
  },
  en: {
    // error
    "notification.invalidCursor": "Invalid cursor value.",
    "notification.notFound": "Notification not found.",
    // success
    "notification.wsTicketIssued": "Connection ticket issued.",
    "notification.listed": "Notifications listed.",
    "notification.unreadCount": "Unread notification count.",
    "notification.markedRead": "Notification marked as read.",
    "notification.allMarkedRead": "All notifications marked as read.",
  },
});

export type NotificationsMessageKey = keyof (typeof notificationsMessages)["tr"];
