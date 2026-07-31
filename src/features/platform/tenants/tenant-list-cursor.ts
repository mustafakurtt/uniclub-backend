/** Operatör tenant listesi keyset cursor — opak base64url, istemci içeriği bilmez. */
export type TenantListPageCursor = { createdAt: Date; id: string };

export function encodeTenantListCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({ v: 1, t: createdAt.getTime(), i: id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** Geçersiz/bozuk cursor için `null` döner; route katmanı `platform.invalidTenantListCursor` fırlatır. */
export function decodeTenantListCursor(cursor: string): TenantListPageCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { v?: number; t?: number | string; i?: string };
    if (parsed.v !== 1 || typeof parsed.i !== "string") {
      return null;
    }
    const epochMs =
      typeof parsed.t === "number"
        ? parsed.t
        : typeof parsed.t === "string"
          ? Date.parse(parsed.t)
          : NaN;
    if (Number.isNaN(epochMs)) {
      return null;
    }
    return { createdAt: new Date(epochMs), id: parsed.i };
  } catch {
    return null;
  }
}
