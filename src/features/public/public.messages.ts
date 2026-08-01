import { defineCatalog } from "../../core/i18n/translator";

export const publicMessages = defineCatalog({
  tr: {
    "public.clubFound": "Kulüp bilgileri getirildi.",
    "public.activityFound": "Etkinlik bilgileri getirildi.",
  },
  en: {
    "public.clubFound": "Club information retrieved.",
    "public.activityFound": "Activity information retrieved.",
  },
});

export type PublicMessageKey = keyof (typeof publicMessages)["tr"];
