import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";
import { getScriptPoolOptions } from "./pool-config";
import { relations } from "./relations";

/** Seed/bootstrap gibi kısa ömürlü scriptler — küçük havuz, açıkça kapatılabilir. */
export function createScriptDb() {
  const db = drizzle(env.DATABASE_URL, { ...getScriptPoolOptions(), relations });
  return {
    db,
    close: () => db.$client.end({ timeout: 5 }),
  };
}
