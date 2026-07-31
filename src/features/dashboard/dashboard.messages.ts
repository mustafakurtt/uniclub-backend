import { defineCatalog } from "../../core/i18n/translator";

/**
 * dashboard feature'ının kullanıcı-cephesi mesajları (aynı `*.messages.ts`
 * konvansiyonu). Salt-okuma bir feature olduğu için çoğu mesaj "yüklendi"dir.
 */
export const dashboardMessages = defineCatalog({
  tr: {
    "feed.invalidCursor": "Geçersiz sayfalama imleci.",
    "feed.listed": "Akış listelendi.",
    "dashboard.summaryLoaded": "Panel özeti yüklendi.",
    "dashboard.clubLoaded": "Kulüp paneli yüklendi.",
    "dashboard.adminLoaded": "Yönetim paneli yüklendi.",
  },
  en: {
    "feed.invalidCursor": "Invalid pagination cursor.",
    "feed.listed": "Feed listed.",
    "dashboard.summaryLoaded": "Dashboard summary loaded.",
    "dashboard.clubLoaded": "Club dashboard loaded.",
    "dashboard.adminLoaded": "Admin dashboard loaded.",
  },
});

export type DashboardMessageKey = keyof (typeof dashboardMessages)["tr"];
