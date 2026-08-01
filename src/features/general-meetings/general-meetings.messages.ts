import { defineCatalog } from "../../core/i18n/translator";

export const generalMeetingsMessages = defineCatalog({
  tr: {
    "generalMeeting.created": "Genel kurul kaydı oluşturuldu.",
    "generalMeeting.listed": "Genel kurul kayıtları listelendi.",
    "generalMeeting.found": "Genel kurul kaydı bulundu.",
    "generalMeeting.notFound": "Genel kurul kaydı bulunamadı.",
    "generalMeeting.termNotFound": "Akademik dönem bulunamadı.",
    "generalMeeting.invalidAttendees": "Katılımcılar kulübün onaylı üyeleri olmalıdır.",
    "generalMeeting.invalidBoardMembers": "Kurul üyeleri kulübün onaylı üyeleri olmalıdır.",
    "generalMeeting.quorumNotMet": "Toplantı yeter sayısına ulaşmadı.",
    "generalMeeting.duplicateBoardPresident": "Yönetim kurulu başkanı (asil) yalnızca bir kişi olabilir.",
  },
  en: {
    "generalMeeting.created": "General meeting record created.",
    "generalMeeting.listed": "General meeting records listed.",
    "generalMeeting.found": "General meeting record found.",
    "generalMeeting.notFound": "General meeting record not found.",
    "generalMeeting.termNotFound": "Academic term not found.",
    "generalMeeting.invalidAttendees": "Attendees must be approved club members.",
    "generalMeeting.invalidBoardMembers": "Board members must be approved club members.",
    "generalMeeting.quorumNotMet": "Meeting quorum was not met.",
    "generalMeeting.duplicateBoardPresident": "Only one principal management board president is allowed.",
  },
});

export type GeneralMeetingsMessageKey = keyof (typeof generalMeetingsMessages)["tr"];
