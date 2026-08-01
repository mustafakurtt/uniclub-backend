import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { clubApplications } from "./applications";
import { compositeForeignKey } from "./helpers";

// ═══════════════════════════════════════════════
// KURULUŞ ÖNERİSİ — DİJİTAL DESTEK TOPLAMA (T1.1)
// ═══════════════════════════════════════════════

export const formationProposalStatusEnum = pgEnum("formation_proposal_status", [
  "collecting_support",
  "submitted",
  "withdrawn",
  "expired",
]);

/**
 * Kulüp kuruluş önerisi — eşik aşılmadan `club_applications` oluşmaz.
 * Tenant ayarı `club.formation.support_threshold` = 0 → bu tablo kullanılmaz (doğrudan başvuru).
 */
export const clubFormationProposals = table("club_formation_proposals", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t
    .uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),
  proposerId: t.uuid("proposer_id").notNull(),
  proposedName: t.varchar("proposed_name", { length: 256 }).notNull(),
  description: t.text(),
  status: formationProposalStatusEnum().default("collecting_support").notNull(),
  /** Aktif destek sayısı — öneri sahibi dahil değil. */
  supportCount: t.integer("support_count").default(0).notNull(),
  applicationId: t
    .uuid("application_id")
    .references(() => clubApplications.id, { onDelete: "set null" }),
  expiresAt: t.timestamp("expires_at", { withTimezone: true }).notNull(),
  submittedAt: t.timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
}, (cols) => [
  compositeForeignKey({
    columns: [cols.proposerId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_formation_proposals_proposer_tenant_fkey",
  }).onDelete("restrict"),
  t.index("club_formation_proposals_university_status_idx").on(cols.universityId, cols.status),
  t.index("club_formation_proposals_proposer_idx").on(cols.proposerId),
]);

/** Dijital destek — öneri sahibi kendi önerisini destekleyemez (API katmanı). */
export const clubFormationSupports = table("club_formation_supports", {
  id: t.uuid().primaryKey().defaultRandom(),
  proposalId: t
    .uuid("proposal_id")
    .references(() => clubFormationProposals.id, { onDelete: "cascade" })
    .notNull(),
  supporterId: t.uuid("supporter_id").notNull(),
  universityId: t.uuid("university_id").notNull(),
  createdAt: t.timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (cols) => [
  t.uniqueIndex("club_formation_supports_proposal_supporter_idx").on(cols.proposalId, cols.supporterId),
  compositeForeignKey({
    columns: [cols.supporterId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_formation_supports_supporter_tenant_fkey",
  }).onDelete("restrict"),
]);
