import { defineCatalog } from "../../core/i18n/translator";

export const handoverMessages = defineCatalog({
  tr: {
    "handover.created": "Devir teslim kaydı oluşturuldu.",
    "handover.listed": "Devir teslim kayıtları listelendi.",
    "handover.found": "Devir teslim kaydı bulundu.",
    "handover.notFound": "Devir teslim kaydı bulunamadı.",
    "handover.meetingNotFound": "Genel kurul kaydı bulunamadı.",
    "handover.meetingWithoutBoard": "Genel kurulda kurul üyesi tanımlı değil.",
    "handover.alreadyRecorded": "Bu genel kurul için devir teslim zaten kaydedildi.",
  },
  en: {
    "handover.created": "Handover record created.",
    "handover.listed": "Handover records listed.",
    "handover.found": "Handover record found.",
    "handover.notFound": "Handover record not found.",
    "handover.meetingNotFound": "General meeting record not found.",
    "handover.meetingWithoutBoard": "General meeting has no board members defined.",
    "handover.alreadyRecorded": "Handover already recorded for this general meeting.",
  },
});

export type HandoverMessageKey = keyof (typeof handoverMessages)["tr"];
