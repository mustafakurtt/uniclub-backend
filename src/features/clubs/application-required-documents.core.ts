/**
 * Kulüp başvurusu zorunlu belge kataloğu — tenant ayarı + parse.
 * Kontrol listesi (T4.1) deseniyle aynı yapı; varsayılan boş katalog (gevşek gönderim).
 */

export type ApplicationRequiredDocumentDef = {
  key: string;
  label: string;
  required: boolean;
};

export const APPLICATION_REQUIRED_DOCUMENT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const APPLICATION_REQUIRED_DOCUMENTS_MAX_ITEMS = 30;
export const APPLICATION_REQUIRED_DOCUMENT_LABEL_MAX = 200;

/** Varsayılan: zorunlu belge yok — kurum kataloğunu tenant ayarından tanımlar. */
export const DEFAULT_APPLICATION_REQUIRED_DOCUMENTS: ApplicationRequiredDocumentDef[] = [];

export function parseRequiredDocuments(raw: unknown): ApplicationRequiredDocumentDef[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > APPLICATION_REQUIRED_DOCUMENTS_MAX_ITEMS) return null;

  const keys = new Set<string>();
  const result: ApplicationRequiredDocumentDef[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const key = (item as { key?: unknown }).key;
    const label = (item as { label?: unknown }).label;
    const required = (item as { required?: unknown }).required;
    if (typeof key !== "string" || !APPLICATION_REQUIRED_DOCUMENT_KEY_PATTERN.test(key)) return null;
    if (keys.has(key)) return null;
    keys.add(key);
    if (
      typeof label !== "string" ||
      label.length < 1 ||
      label.length > APPLICATION_REQUIRED_DOCUMENT_LABEL_MAX
    ) {
      return null;
    }
    if (typeof required !== "boolean") return null;
    result.push({ key, label, required });
  }

  return result;
}

export function requiredDocumentsEquals(
  a: ApplicationRequiredDocumentDef[],
  b: ApplicationRequiredDocumentDef[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.key === b[i].key && item.label === b[i].label && item.required === b[i].required
    )
  );
}
