import { defineCatalog } from "../../core/i18n/translator";

export const exportsMessages = defineCatalog({
  tr: {
    "exports.catalogListed": "Rapor kataloğu listelendi.",
    "exports.reportNotFound": "Rapor tanımı bulunamadı.",
    "exports.clubNotFound": "Kulüp bulunamadı.",
    "exports.applicationNotFound": "Başvuru bulunamadı.",
    "exports.meetingNotFound": "Genel kurul kaydı bulunamadı.",
    "exports.rowLimitExceeded": "Sonuç çok büyük; lütfen filtreleri daraltın.",
    "exports.generated": "Rapor üretildi.",
  },
  en: {
    "exports.catalogListed": "Report catalog listed.",
    "exports.reportNotFound": "Report definition not found.",
    "exports.clubNotFound": "Club not found.",
    "exports.applicationNotFound": "Application not found.",
    "exports.meetingNotFound": "General meeting record not found.",
    "exports.rowLimitExceeded": "Result set too large; narrow your filters.",
    "exports.generated": "Report generated.",
  },
});

export type ExportsMessageKey = keyof (typeof exportsMessages)["tr"];
