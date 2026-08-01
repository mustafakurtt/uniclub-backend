import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { compositeForeignKey } from "./helpers";

// ═══════════════════════════════════════════════
// CLUB APPLICATIONS + GENİŞLETİLEBİLİR ONAY ZİNCİRİ
// ═══════════════════════════════════════════════
export const applicationStatusEnum = pgEnum("application_status", [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
]);
export const applicationApprovalStatusEnum = pgEnum("application_approval_status", [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
]);

export const clubApplicationEventTypeEnum = pgEnum("club_application_event_type", [
  "revision_requested",
  "resubmitted",
  "approved",
  "rejected",
]);

export const clubApplications = table("club_applications", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t
    .uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),

  proposedName: t.varchar("proposed_name", { length: 256 }).notNull(),
  description: t.text(),
  applicantId: t.uuid("applicant_id").notNull(),

  status: applicationStatusEnum().default("pending").notNull(), // özet durum, approvals adımlarından türetilir
  ...timestamps,
}, (cols) => [
  compositeForeignKey({
    columns: [cols.applicantId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_applications_applicant_tenant_fkey",
  }).onDelete("restrict"),
  t.index("club_applications_university_status_idx").on(cols.universityId, cols.status),
  t.index("club_applications_applicant_idx").on(cols.applicantId),
]);

// Her onay adımı ayrı bir satır. Çok kademe = step 2, 3… satırları eklenir.
export const clubApplicationApprovals = table("club_application_approvals", {
  id: t.uuid().primaryKey().defaultRandom(),
  applicationId: t
    .uuid("application_id")
    .references(() => clubApplications.id, { onDelete: "cascade" })
    .notNull(),

  step: t.integer().notNull(),
  // Karar verici belirteci — tenant zincirindeki rol veya `club_approver` (club.approve yetkisi).
  approverRole: t.varchar("approver_role", { length: 100 }),
  approverId: t.uuid("approver_id").references(() => users.id, { onDelete: "set null" }),

  status: applicationApprovalStatusEnum().default("pending").notNull(),
  /**
   * Karar gerekçesi. Ret ve revizyon talebinde ZORUNLU (API katmanında).
   * Onayda opsiyonel not.
   */
  note: t.text(),
  reviewedAt: t.timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (cols) => [
  t.uniqueIndex("application_step_idx").on(cols.applicationId, cols.step),
]);

/**
 * Başvuru olay günlüğü — append-only; aynı kademede birden çok revizyon turu burada okunur.
 * `club_application_approvals` yalnızca o kademenin güncel durumunu tutar.
 */
export const clubApplicationEvents = table("club_application_events", {
  id: t.uuid().primaryKey().defaultRandom(),
  applicationId: t
    .uuid("application_id")
    .references(() => clubApplications.id, { onDelete: "cascade" })
    .notNull(),
  step: t.integer().notNull(),
  eventType: clubApplicationEventTypeEnum("event_type").notNull(),
  actorId: t.uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  note: t.text(),
  proposedName: t.varchar("proposed_name", { length: 256 }),
  description: t.text(),
  createdAt: t.timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (cols) => [
  t.index("club_application_events_application_created_idx").on(cols.applicationId, cols.createdAt),
]);
