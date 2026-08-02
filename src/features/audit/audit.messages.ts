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
    "audit.periodRequired": "Dönem için academicTermId veya from/to gerekli.",
    "audit.invalidPeriod": "Geçersiz tarih aralığı.",
    // başarı
    "audit.listed": "Denetim kayıtları listelendi.",
    "audit.summaryLoaded": "Kurum faaliyet özeti yüklendi.",
    "audit.decisionsListed": "Karar denetim kayıtları listelendi.",
  },
  en: {
    // error
    "audit.invalidCursor": "Invalid cursor value.",
    "audit.periodRequired": "academicTermId or from/to is required for the period.",
    "audit.invalidPeriod": "Invalid date range.",
    // success
    "audit.listed": "Audit logs listed.",
    "audit.summaryLoaded": "Institutional activity summary loaded.",
    "audit.decisionsListed": "Decision audit records listed.",
  },
});

export type AuditMessageKey = keyof (typeof auditMessages)["tr"];
