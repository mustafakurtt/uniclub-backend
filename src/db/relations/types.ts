import type { ExtractTablesFromSchema, RelationsBuilder } from "drizzle-orm";
import type * as schema from "../schema";

type Tables = ExtractTablesFromSchema<typeof schema>;

/** `defineRelations(schema, (r) => ...)` içindeki `r` yardımcısının tipi. */
export type RelationHelpers = RelationsBuilder<Tables>;
