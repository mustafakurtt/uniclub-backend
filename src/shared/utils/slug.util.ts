const TURKISH_CHAR_MAP: Record<string, string> = {
  ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g",
  ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c",
};

const TURKISH_CHAR_REGEX = new RegExp(`[${Object.keys(TURKISH_CHAR_MAP).join("")}]`, "g");

/**
 * Metni URL dostu bir slug'a çevirir (Türkçe karakter desteğiyle).
 */
export const slugify = (text: string): string => {
  const withoutTurkishChars = text.replace(
    TURKISH_CHAR_REGEX,
    (ch) => TURKISH_CHAR_MAP[ch] ?? ch
  );

  return withoutTurkishChars
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};
