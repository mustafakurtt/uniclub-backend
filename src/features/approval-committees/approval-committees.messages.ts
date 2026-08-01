import { defineCatalog } from "../../core/i18n/translator";

export const approvalCommitteeMessages = defineCatalog({
  tr: {
    "approvalCommittee.listed": "Onay kurulları listelendi.",
    "approvalCommittee.found": "Onay kurulu bulundu.",
    "approvalCommittee.created": "Onay kurulu oluşturuldu.",
    "approvalCommittee.updated": "Onay kurulu güncellendi.",
    "approvalCommittee.notFound": "Onay kurulu bulunamadı.",
    "approvalCommittee.invalidMembers": "Kurul üyeleri bu üniversiteye ait olmalıdır.",
  },
  en: {
    "approvalCommittee.listed": "Approval committees listed.",
    "approvalCommittee.found": "Approval committee found.",
    "approvalCommittee.created": "Approval committee created.",
    "approvalCommittee.updated": "Approval committee updated.",
    "approvalCommittee.notFound": "Approval committee not found.",
    "approvalCommittee.invalidMembers": "Committee members must belong to this university.",
  },
});

export type ApprovalCommitteeMessageKey = keyof typeof approvalCommitteeMessages.tr;
