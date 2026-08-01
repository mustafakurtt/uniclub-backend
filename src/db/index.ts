import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";
import { getAppPoolOptions } from "./pool-config";
import { relations } from "./relations";

export const db = drizzle(env.DATABASE_URL, { ...getAppPoolOptions(), relations });

/** Süreç kapanışında havuzu boşalt (seed, bootstrap, test teardown). */
export async function closeDb(): Promise<void> {
  await db.$client.end({ timeout: 5 });
}
