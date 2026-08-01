import { resolveLocale } from "../../core/i18n/locale";

export interface ResolveAppLocaleOptions {
  userPreferredLanguage?: string | null;
  acceptLanguage?: string | null;
  tenantDefaultLocale?: string | null;
  supported: readonly string[];
  systemDefault: string;
  /** false = arka plan (mail, bildirim, kuyruk) — Accept-Language yok. */
  useAcceptLanguage?: boolean;
}

/**
 * İstek bağlamı dil önceliği:
 * kullanıcı tercihi → Accept-Language → tenant varsayılanı → sistem varsayılanı
 *
 * Arka plan bağlamı (`useAcceptLanguage: false`):
 * kullanıcı tercihi → tenant varsayılanı → sistem varsayılanı
 * (Başlık yok — iş kuyruğu/mail isteğe bağlı değil; tenant okul dili mantıklı düşüş.)
 */
export function resolveAppLocale(options: ResolveAppLocaleOptions): string {
  const {
    userPreferredLanguage,
    acceptLanguage,
    tenantDefaultLocale,
    supported,
    systemDefault,
    useAcceptLanguage = true,
  } = options;

  if (userPreferredLanguage && supported.includes(userPreferredLanguage)) {
    return userPreferredLanguage;
  }

  if (useAcceptLanguage && acceptLanguage) {
    const fromHeader = resolveLocaleFromHeader(acceptLanguage, supported);
    if (fromHeader) return fromHeader;
  }

  if (tenantDefaultLocale && supported.includes(tenantDefaultLocale)) {
    return tenantDefaultLocale;
  }

  return systemDefault;
}

/** Header'dan eşleşme yoksa null — zincir tenant/sistem düşüşüne devam eder. */
export function resolveLocaleFromHeader(
  acceptLanguage: string,
  supported: readonly string[]
): string | null {
  const sentinel = "__no_match__";
  const resolved = resolveLocale(acceptLanguage, supported, sentinel);
  return resolved === sentinel ? null : resolved;
}
