import { defineCatalog } from "../../core/i18n/translator";

/**
 * audit feature'ının kullanıcı-cephesi mesajları (hata + başarı), feature
 * içinde — aynı `*.permissions.ts` konvansiyonu. Kompozisyon kökü
 * shared/i18n/messages.ts bunu mergeCatalogs ile birleştirir.
 */
export const auditMessages = defineCatalog({
  tr: {
    // hata
    "audit.invalidCursor": "Geçersiz cursor değeri.",
    // başarı
    "audit.listed": "Denetim kayıtları listelendi.",
  },
  en: {
    // error
    "audit.invalidCursor": "Invalid cursor value.",
    // success
    "audit.listed": "Audit logs listed.",
  },
});

export type AuditMessageKey = keyof (typeof auditMessages)["tr"];
