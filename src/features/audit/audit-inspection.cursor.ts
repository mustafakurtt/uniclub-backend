/** Denetim karar listesi keyset cursor — opak base64url; `(createdAt, id)` tie-break. */
export type AuditDecisionPageCursor = { createdAt: Date; id: string };

export function encodeAuditDecisionCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({ v: 1, t: createdAt.getTime(), i: id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeAuditDecisionCursor(cursor: string): AuditDecisionPageCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { v?: number; t?: number; i?: string };
    if (parsed.v !== 1 || typeof parsed.t !== "number" || typeof parsed.i !== "string") {
      return null;
    }
    return { createdAt: new Date(parsed.t), id: parsed.i };
  } catch {
    return null;
  }
}
