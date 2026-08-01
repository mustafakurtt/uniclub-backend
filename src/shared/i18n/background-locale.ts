import { resolveAppLocale } from "./locale-resolution";
import {
  resolveTenantDefaultLocale,
  resolveUserPreferredLanguage,
} from "./locale.cache";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./translator";

/**
 * Mail, bildirim ve kuyruk işleri için dil çözümü (Accept-Language yok).
 * Kullanıcı tercihi → tenant varsayılanı → sistem varsayılanı.
 */
export async function resolveBackgroundLocale(
  userId: string,
  universityId: string | null
): Promise<string> {
  const userPreferred = await resolveUserPreferredLanguage(userId);
  const tenantDefault = universityId ? await resolveTenantDefaultLocale(universityId) : undefined;

  return resolveAppLocale({
    userPreferredLanguage: userPreferred,
    tenantDefaultLocale: tenantDefault,
    supported: SUPPORTED_LOCALES,
    systemDefault: DEFAULT_LOCALE,
    useAcceptLanguage: false,
  });
}

/** Davet maili gibi henüz hesabı olmayan alıcılar — yalnızca tenant varsayılanı. */
export async function resolveBackgroundLocaleForTenant(universityId: string): Promise<string> {
  const tenantDefault = await resolveTenantDefaultLocale(universityId);

  return resolveAppLocale({
    tenantDefaultLocale: tenantDefault,
    supported: SUPPORTED_LOCALES,
    systemDefault: DEFAULT_LOCALE,
    useAcceptLanguage: false,
  });
}
