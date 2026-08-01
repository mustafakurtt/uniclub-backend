import { createMiddleware } from "hono/factory";
import type { LocaleVariables } from "../core/i18n/locale";
import type { Variables } from "../core/auth/auth.middleware";
import { resolveAppLocale } from "../shared/i18n/locale-resolution";
import {
  resolveTenantDefaultLocale,
  resolveUserPreferredLanguage,
} from "../shared/i18n/locale.cache";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "../shared/i18n/translator";

/**
 * Uygulama dil önceliği: kullanıcı tercihi → Accept-Language → tenant varsayılanı → tr.
 * `optionalAuthMiddleware` SONRASINDA mount edilir. Dil tercihleri cache'lenir.
 */
export function createAppLocaleMiddleware() {
  return createMiddleware<{ Variables: Variables & LocaleVariables }>(async (c, next) => {
    let userPreferred: string | undefined;
    let tenantDefault: string | undefined;

    const user = c.get("user");
    if (user?.userId) {
      userPreferred = await resolveUserPreferredLanguage(user.userId);
      if (user.universityId) {
        tenantDefault = await resolveTenantDefaultLocale(user.universityId);
      }
    }

    c.set(
      "locale",
      resolveAppLocale({
        userPreferredLanguage: userPreferred,
        acceptLanguage: c.req.header("Accept-Language"),
        tenantDefaultLocale: tenantDefault,
        supported: SUPPORTED_LOCALES,
        systemDefault: DEFAULT_LOCALE,
      })
    );
    await next();
  });
}
