import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";

import { relations } from "./relations";

export const db = drizzle(env.DATABASE_URL, { relations });