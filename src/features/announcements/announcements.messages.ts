import { defineCatalog } from "../../core/i18n/translator";

/**
 * announcements feature'ının kullanıcı-cephesi mesajları, feature içinde —
 * aynı `*.permissions.ts` konvansiyonu. Kompozisyon kökü shared/i18n/messages.ts
 * bunu mergeCatalogs ile birleştirir.
 */
export const announcementsMessages = defineCatalog({
  tr: {
    // hata
    "announcement.notFound": "Duyuru bulunamadı.",
    // başarı
    "announcement.listed": "Duyurular listelendi.",
    "announcement.created": "Duyuru oluşturuldu.",
    "announcement.deleted": "Duyuru silindi.",
  },
  en: {
    // error
    "announcement.notFound": "Announcement not found.",
    // success
    "announcement.listed": "Announcements listed.",
    "announcement.created": "Announcement created.",
    "announcement.deleted": "Announcement deleted.",
  },
});

export type AnnouncementsMessageKey = keyof (typeof announcementsMessages)["tr"];
