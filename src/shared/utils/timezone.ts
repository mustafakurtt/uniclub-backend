/**
 * IANA saat dilimi doğrulaması — geçersiz değer sessizce kabul edilmez (etkinlik
 * saatleri kayar). `Intl.supportedValuesOf` varsa tam liste; yoksa DateTimeFormat
 * ile deneme.
 */
export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone || timezone.length > 64) return false;
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone").includes(timezone);
    }
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
