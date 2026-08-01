import { defineCatalog } from "../../core/i18n/translator";

export const membershipHistoryMessages = defineCatalog({
  tr: {
    "membershipHistory.listed": "Üyelik tarihçesi listelendi.",
  },
  en: {
    "membershipHistory.listed": "Membership history listed.",
  },
});

export type MembershipHistoryMessageKey = keyof (typeof membershipHistoryMessages)["tr"];
