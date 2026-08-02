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
    "announcement.notDraft": "Yalnızca taslak duyurular yayınlanabilir.",
    "announcement.pinnedLimit": "Bu kulüpte en fazla 3 duyuru sabitlenebilir.",
    "announcement.universityPinnedLimit": "Okul genelinde en fazla 3 duyuru sabitlenebilir.",
    // başarı
    "announcement.listed": "Duyurular listelendi.",
    "announcement.found": "Duyuru getirildi.",
    "announcement.created": "Duyuru oluşturuldu.",
    "announcement.published": "Duyuru yayınlandı.",
    "announcement.updated": "Duyuru güncellendi.",
    "announcement.deleted": "Duyuru silindi.",
  },
  en: {
    // error
    "announcement.notFound": "Announcement not found.",
    "announcement.notDraft": "Only draft announcements can be published.",
    "announcement.pinnedLimit": "A club can pin at most 3 announcements.",
    "announcement.universityPinnedLimit": "At most 3 university-wide announcements can be pinned.",
    // success
    "announcement.listed": "Announcements listed.",
    "announcement.found": "Announcement retrieved.",
    "announcement.created": "Announcement created.",
    "announcement.published": "Announcement published.",
    "announcement.updated": "Announcement updated.",
    "announcement.deleted": "Announcement deleted.",
  },
});

export type AnnouncementsMessageKey = keyof (typeof announcementsMessages)["tr"];
