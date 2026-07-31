import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import type { LocaleVariables } from "../core/i18n/locale";
import type { Variables } from "../core/auth/auth.middleware";
import { db } from "../db";
import { users, universities } from "../db/schema";
import { resolveAppLocale } from "../shared/i18n/locale-resolution";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "../shared/i18n/translator";

/**
 * Uygulama dil önceliği: kullanıcı tercihi → Accept-Language → tenant varsayılanı → tr.
 * `optionalAuthMiddleware` SONRASINDA mount edilir.
 */
export function createAppLocaleMiddleware() {
  return createMiddleware<{ Variables: Variables & LocaleVariables }>(async (c, next) => {
    let userPreferred: string | undefined;
    let tenantDefault: string | undefined;

    const user = c.get("user");
    if (user?.userId) {
      const [userRow] = await db
        .select({ preferredLanguage: users.preferredLanguage })
        .from(users)
        .where(eq(users.id, user.userId))
        .limit(1);
      userPreferred = userRow?.preferredLanguage;

      if (user.universityId) {
        const [uniRow] = await db
          .select({ defaultLocale: universities.defaultLocale })
          .from(universities)
          .where(eq(universities.id, user.universityId))
          .limit(1);
        tenantDefault = uniRow?.defaultLocale;
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
