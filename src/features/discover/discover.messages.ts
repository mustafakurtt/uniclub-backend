import { defineCatalog } from "../../core/i18n/translator";

export const discoverMessages = defineCatalog({
  tr: {
    "discover.activitiesListed": "Üniversiteler arası etkinlikler listelendi.",
    "discover.invalidCursor": "Geçersiz sayfalama imleci.",
  },
  en: {
    "discover.activitiesListed": "Inter-university activities listed.",
    "discover.invalidCursor": "Invalid pagination cursor.",
  },
});

export type DiscoverMessageKey = keyof (typeof discoverMessages)["tr"];
