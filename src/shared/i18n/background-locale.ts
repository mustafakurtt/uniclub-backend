import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users, universities } from "../../db/schema";
import { resolveAppLocale } from "./locale-resolution";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./translator";

/**
 * Mail, bildirim ve kuyruk işleri için dil çözümü (Accept-Language yok).
 * Kullanıcı tercihi → tenant varsayılanı → sistem varsayılanı.
 */
export async function resolveBackgroundLocale(
  userId: string,
  universityId: string | null
): Promise<string> {
  const [userRow] = await db
    .select({ preferredLanguage: users.preferredLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let tenantDefault: string | undefined;
  if (universityId) {
    const [uniRow] = await db
      .select({ defaultLocale: universities.defaultLocale })
      .from(universities)
      .where(eq(universities.id, universityId))
      .limit(1);
    tenantDefault = uniRow?.defaultLocale;
  }

  return resolveAppLocale({
    userPreferredLanguage: userRow?.preferredLanguage,
    tenantDefaultLocale: tenantDefault,
    supported: SUPPORTED_LOCALES,
    systemDefault: DEFAULT_LOCALE,
    useAcceptLanguage: false,
  });
}

/** Davet maili gibi henüz hesabı olmayan alıcılar — yalnızca tenant varsayılanı. */
export async function resolveBackgroundLocaleForTenant(universityId: string): Promise<string> {
  const [uniRow] = await db
    .select({ defaultLocale: universities.defaultLocale })
    .from(universities)
    .where(eq(universities.id, universityId))
    .limit(1);

  return resolveAppLocale({
    tenantDefaultLocale: uniRow?.defaultLocale,
    supported: SUPPORTED_LOCALES,
    systemDefault: DEFAULT_LOCALE,
    useAcceptLanguage: false,
  });
}
