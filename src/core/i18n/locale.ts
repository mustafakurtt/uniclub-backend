import { createMiddleware } from "hono/factory";

/** Bağlama yazılan dil değişkeni; error-handler ve (ileride) respond okur. */
export type LocaleVariables = { locale: string };

/**
 * Accept-Language header'ından desteklenen bir dil çözer.
 * Örn. "tr-TR,tr;q=0.9,en;q=0.8" → ilk desteklenen kök dil ("tr"), yoksa fallback.
 *
 * q-değeri (kalite) sıralamasını ŞİMDİLİK yok sayarız: istemci zaten dilleri
 * öncelik sırasına göre gönderir, bu yüzden ilk eşleşen yeterli. Gerekirse sonra
 * q-parse eklenebilir (keskin hat yok).
 */
export function resolveLocale(
  header: string | undefined,
  supported: readonly string[],
  fallback: string
): string {
  if (!header) return fallback;
  const wanted = header
    .split(",")
    .map((part) => part.split(";")[0].trim().split("-")[0].toLowerCase());
  return wanted.find((locale) => supported.includes(locale)) ?? fallback;
}

export interface LocaleMiddlewareOptions {
  supported: readonly string[];
  fallback: string;
}

/**
 * Dili istek başında bir kez çözüp `c.set("locale")` ile bağlama yazan middleware
 * (requestId ile aynı mantık — erken çözülür, aşağıdaki her katman okur).
 */
export function createLocaleMiddleware({ supported, fallback }: LocaleMiddlewareOptions) {
  return createMiddleware<{ Variables: LocaleVariables }>(async (c, next) => {
    c.set("locale", resolveLocale(c.req.header("Accept-Language"), supported, fallback));
    await next();
  });
}
