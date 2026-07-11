import type { Catalog } from "../../core/i18n/translator";

/**
 * Çapraz-kesen (feature'a ait olmayan) mesajlar: doğrulama ve altyapı hatası.
 * Feature mesajları ilgili feature'ın `*.messages.ts` dosyasında yaşar.
 */
export const commonMessages: Catalog = {
  tr: {
    "validation.failed": "Girdi doğrulaması başarısız.",
    "server.unexpected": "Sunucu tarafında beklenmeyen bir hata oluştu.",
  },
  en: {
    "validation.failed": "Validation failed.",
    "server.unexpected": "An unexpected error occurred on the server.",
  },
};
