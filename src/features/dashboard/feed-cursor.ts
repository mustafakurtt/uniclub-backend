/** Öğrenci feed keyset cursor — opak base64url; heterojen duyuru+etkinlik birleşimi. */
export type FeedPageCursor = {
  at: Date;
  kind: "university_announcement" | "announcement" | "activity";
  id: string;
};

export function encodeFeedCursor(at: Date, kind: FeedPageCursor["kind"], id: string): string {
  const payload = JSON.stringify({ v: 1, t: at.getTime(), k: kind, i: id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** Geçersiz/bozuk cursor için `null`; ISO 8601 legacy cursor için kısmi imleç. */
export function decodeFeedCursor(cursor: string): FeedPageCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { v?: number; t?: number; k?: string; i?: string };
    if (parsed.v !== 1 || typeof parsed.i !== "string") return null;
    if (
      parsed.k !== "university_announcement" &&
      parsed.k !== "announcement" &&
      parsed.k !== "activity"
    ) {
      return null;
    }
    const epochMs = typeof parsed.t === "number" ? parsed.t : NaN;
    if (Number.isNaN(epochMs)) return null;
    return { at: new Date(epochMs), kind: parsed.k as FeedPageCursor["kind"], id: parsed.i };
  } catch {
    const legacy = Date.parse(cursor);
    if (Number.isNaN(legacy)) return null;
    return { at: new Date(legacy), kind: "activity", id: "" };
  }
}
