import { defineCatalog } from "../../core/i18n/translator";

/**
 * media feature'ının kullanıcı-cephesi mesajları (aynı `*.messages.ts` konvansiyonu).
 */
export const mediaMessages = defineCatalog({
  tr: {
    // hata
    "media.noFile": "Yüklenecek dosya bulunamadı (form alanı: 'file').",
    "media.empty": "Boş dosya yüklenemez.",
    "media.tooLarge": "Dosya boyutu üst sınırı aştı.",
    "media.unsupportedType": "Yalnızca görsel yüklenebilir (PNG, JPEG, WEBP, GIF).",
    "media.invalidPurpose": "Geçersiz kullanım amacı (purpose).",
    "media.notFound": "Dosya bulunamadı.",
    "media.invalidKey": "Geçersiz dosya anahtarı.",
    // başarı
    "media.uploaded": "Dosya yüklendi.",
    "media.deleted": "Dosya silindi.",
  },
  en: {
    // error
    "media.noFile": "No file to upload (form field: 'file').",
    "media.empty": "An empty file cannot be uploaded.",
    "media.tooLarge": "File size exceeds the limit.",
    "media.unsupportedType": "Only images can be uploaded (PNG, JPEG, WEBP, GIF).",
    "media.invalidPurpose": "Invalid usage purpose.",
    "media.notFound": "File not found.",
    "media.invalidKey": "Invalid file key.",
    // success
    "media.uploaded": "File uploaded.",
    "media.deleted": "File deleted.",
  },
});

export type MediaMessageKey = keyof (typeof mediaMessages)["tr"];
