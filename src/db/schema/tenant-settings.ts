import { pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";

/**
 * Tenant başına seyrek ayar sapmaları — varsayılanlar kod kataloğunda.
 * `key` varchar: genişleyen katalog için pgEnum yerine kod tarafı `as const` (bkz. tenant-settings.catalog.ts).
 */
export const tenantSettings = table(
  "tenant_settings",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    universityId: t
      .uuid("university_id")
      .references(() => universities.id, { onDelete: "cascade" })
      .notNull(),
    key: t.varchar({ length: 64 }).notNull(),
    value: t.jsonb("value").notNull(),
    updatedBy: t.uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (cols) => [t.unique("tenant_settings_university_key_unique").on(cols.universityId, cols.key)]
);
