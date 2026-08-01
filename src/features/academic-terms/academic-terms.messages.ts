import { defineCatalog } from "../../core/i18n/translator";

export const academicTermMessages = defineCatalog({
  tr: {
    "academicTerm.listed": "Akademik dönemler listelendi.",
    "academicTerm.created": "Akademik dönem oluşturuldu.",
    "academicTerm.updated": "Akademik dönem güncellendi.",
    "academicTerm.deleted": "Akademik dönem silindi.",
    "academicTerm.notFound": "Akademik dönem bulunamadı.",
    "academicTerm.endsBeforeStarts": "Dönem bitiş tarihi başlangıçtan sonra olmalıdır.",
    "academicTerm.overlap": "Bu tarih aralığı mevcut bir dönemle çakışıyor.",
    "academicTerm.hasHistory": "Bu döneme bağlı üyelik kayıtları var; silinemez.",
  },
  en: {
    "academicTerm.listed": "Academic terms listed.",
    "academicTerm.created": "Academic term created.",
    "academicTerm.updated": "Academic term updated.",
    "academicTerm.deleted": "Academic term deleted.",
    "academicTerm.notFound": "Academic term not found.",
    "academicTerm.endsBeforeStarts": "Term end must be after start.",
    "academicTerm.overlap": "This date range overlaps an existing term.",
    "academicTerm.hasHistory": "Membership records reference this term; it cannot be deleted.",
  },
});

export type AcademicTermMessageKey = keyof (typeof academicTermMessages)["tr"];
