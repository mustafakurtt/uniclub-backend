/**
 * Kulüp başvuru inceleme kontrol listesi — tenant kataloğu + parse.
 */

export type ApplicationReviewChecklistItemDef = {
  key: string;
  label: string;
  required: boolean;
};

export const APPLICATION_REVIEW_CHECKLIST_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const APPLICATION_REVIEW_CHECKLIST_MAX_ITEMS = 30;
export const APPLICATION_REVIEW_CHECKLIST_LABEL_MAX = 200;

export const DEFAULT_APPLICATION_REVIEW_CHECKLIST: ApplicationReviewChecklistItemDef[] = [
  { key: "documents_complete", label: "Gerekli evraklar tam", required: true },
  { key: "bylaws_ok", label: "Tüzük kurallara uygun", required: true },
  { key: "advisor_nominated", label: "Danışman adayı belirtildi", required: false },
  { key: "name_compliant", label: "Kulüp adı kurallara uygun", required: true },
];

export function parseReviewChecklist(raw: unknown): ApplicationReviewChecklistItemDef[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 1 || raw.length > APPLICATION_REVIEW_CHECKLIST_MAX_ITEMS) return null;

  const keys = new Set<string>();
  const result: ApplicationReviewChecklistItemDef[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const key = (item as { key?: unknown }).key;
    const label = (item as { label?: unknown }).label;
    const required = (item as { required?: unknown }).required;
    if (typeof key !== "string" || !APPLICATION_REVIEW_CHECKLIST_KEY_PATTERN.test(key)) return null;
    if (keys.has(key)) return null;
    keys.add(key);
    if (
      typeof label !== "string" ||
      label.length < 1 ||
      label.length > APPLICATION_REVIEW_CHECKLIST_LABEL_MAX
    ) {
      return null;
    }
    if (typeof required !== "boolean") return null;
    result.push({ key, label, required });
  }

  return result;
}

export function reviewChecklistEquals(
  a: ApplicationReviewChecklistItemDef[],
  b: ApplicationReviewChecklistItemDef[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.key === b[i].key && item.label === b[i].label && item.required === b[i].required
    )
  );
}
