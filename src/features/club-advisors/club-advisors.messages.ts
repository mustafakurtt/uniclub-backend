import { defineCatalog } from "../../core/i18n/translator";

export const clubAdvisorMessages = defineCatalog({
  tr: {
    "clubAdvisor.invitationSent": "Danışman daveti gönderildi.",
    "clubAdvisor.invitationsListed": "Danışman davetleri listelendi.",
    "clubAdvisor.invitationAccepted": "Danışman daveti kabul edildi.",
    "clubAdvisor.invitationDeclined": "Danışman daveti reddedildi.",
    "clubAdvisor.invitationCancelled": "Danışman daveti iptal edildi.",
    "clubAdvisor.withdrawn": "Danışmanlıktan çekildiniz.",
    "clubAdvisor.invitationNotFound": "Danışman daveti bulunamadı.",
    "clubAdvisor.invitationExpired": "Danışman davetinin süresi doldu.",
    "clubAdvisor.invitationNotPending": "Bu davet yanıtlanamaz.",
    "clubAdvisor.pendingInvitationExists": "Bu kişiye zaten bekleyen bir davet var.",
    "clubAdvisor.alreadyAdvisor": "Bu kişi zaten kulübün danışmanı.",
    "clubAdvisor.notAdvisor": "Bu kulübün aktif danışmanı değilsiniz.",
    "clubAdvisor.notEligible": "Yalnızca danışman rolündeki personel davet edilebilir.",
  },
  en: {
    "clubAdvisor.invitationSent": "Advisor invitation sent.",
    "clubAdvisor.invitationsListed": "Advisor invitations listed.",
    "clubAdvisor.invitationAccepted": "Advisor invitation accepted.",
    "clubAdvisor.invitationDeclined": "Advisor invitation declined.",
    "clubAdvisor.invitationCancelled": "Advisor invitation cancelled.",
    "clubAdvisor.withdrawn": "You have withdrawn as advisor.",
    "clubAdvisor.invitationNotFound": "Advisor invitation not found.",
    "clubAdvisor.invitationExpired": "Advisor invitation has expired.",
    "clubAdvisor.invitationNotPending": "This invitation cannot be responded to.",
    "clubAdvisor.pendingInvitationExists": "A pending invitation already exists for this person.",
    "clubAdvisor.alreadyAdvisor": "This person is already an advisor of the club.",
    "clubAdvisor.notAdvisor": "You are not an active advisor of this club.",
    "clubAdvisor.notEligible": "Only staff with the advisor role can be invited.",
  },
});

export type ClubAdvisorMessageKey = keyof (typeof clubAdvisorMessages)["tr"];
