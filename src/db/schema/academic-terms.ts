import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";

// ═══════════════════════════════════════════════
// AKADEMİK DÖNEMLER (tenant kapsamlı)
// ═══════════════════════════════════════════════
/**
 * Kurum kendi takvimini tanımlar — Güz/Bahar/Yaz sabitleri koda gömülmez.
 * "Aktif dönem" = `status = open` ve bugün `[startsAt, endsAt]` aralığında.
 * Çakışan aralıklar DB exclusion constraint ile reddedilir (migration SQL).
 */
export const academicTermStatusEnum = pgEnum("academic_term_status", ["open", "closed"]);

export const academicTerms = table("academic_terms", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t
    .uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),
  name: t.varchar({ length: 128 }).notNull(),
  startsAt: t.timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: t.timestamp("ends_at", { withTimezone: true }).notNull(),
  status: academicTermStatusEnum().default("open").notNull(),
  ...timestamps,
}, (cols) => [
  t.unique("academic_terms_id_university_unique").on(cols.id, cols.universityId),
  t.index("academic_terms_university_starts_idx").on(cols.universityId, cols.startsAt),
]);
