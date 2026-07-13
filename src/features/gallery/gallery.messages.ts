import { defineCatalog } from "../../core/i18n/translator";

/**
 * gallery feature'ının kullanıcı-cephesi mesajları, feature içinde — aynı
 * `*.permissions.ts` konvansiyonu. Kompozisyon kökü shared/i18n/messages.ts
 * bunu mergeCatalogs ile birleştirir.
 */
export const galleryMessages = defineCatalog({
  tr: {
    // hata
    "gallery.imageNotFound": "Görsel bulunamadı.",
    // başarı
    "gallery.listed": "Galeri listelendi.",
    "gallery.imageAdded": "Görsel eklendi.",
    "gallery.imageRemoved": "Görsel kaldırıldı.",
  },
  en: {
    // error
    "gallery.imageNotFound": "Image not found.",
    // success
    "gallery.listed": "Gallery listed.",
    "gallery.imageAdded": "Image added.",
    "gallery.imageRemoved": "Image removed.",
  },
});

export type GalleryMessageKey = keyof (typeof galleryMessages)["tr"];
