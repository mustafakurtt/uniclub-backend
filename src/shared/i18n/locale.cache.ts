import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users, universities } from "../../db/schema";
import { cache } from "../cache/cache.client";
import { DEFAULT_LOCALE } from "./translator";

const localeCache = cache.namespace("i18n:locale");
/** Tenant status (60s) daha sık değişir; dil daha seyrek — 10 dk yeterli. */
const TTL_SECONDS = 600;

async function readUserPreferredLanguage(userId: string): Promise<string> {
  const [row] = await db
    .select({ preferredLanguage: users.preferredLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.preferredLanguage ?? DEFAULT_LOCALE;
}

async function readTenantDefaultLocale(universityId: string): Promise<string> {
  const [row] = await db
    .select({ defaultLocale: universities.defaultLocale })
    .from(universities)
    .where(eq(universities.id, universityId))
    .limit(1);
  return row?.defaultLocale ?? DEFAULT_LOCALE;
}

/** Fail-open: cache/DB düşerse sistem varsayılanına düş (dil güvenlik kapısı değil). */
export async function resolveUserPreferredLanguage(userId: string): Promise<string> {
  try {
    return await localeCache.getOrSet(`user:${userId}`, () => readUserPreferredLanguage(userId), {
      ttlSeconds: TTL_SECONDS,
    });
  } catch {
    try {
      return await readUserPreferredLanguage(userId);
    } catch {
      return DEFAULT_LOCALE;
    }
  }
}

export async function resolveTenantDefaultLocale(universityId: string): Promise<string> {
  try {
    return await localeCache.getOrSet(
      `tenant:${universityId}`,
      () => readTenantDefaultLocale(universityId),
      { ttlSeconds: TTL_SECONDS }
    );
  } catch {
    try {
      return await readTenantDefaultLocale(universityId);
    } catch {
      return DEFAULT_LOCALE;
    }
  }
}

export async function invalidateUserPreferredLanguage(userId: string): Promise<void> {
  try {
    await localeCache.delete(`user:${userId}`);
  } catch {
    /* fail-open */
  }
}

export async function invalidateTenantDefaultLocale(universityId: string): Promise<void> {
  try {
    await localeCache.delete(`tenant:${universityId}`);
  } catch {
    /* fail-open */
  }
}
