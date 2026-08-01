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
  "checklist_updated",
  "appeal_submitted",
  "appeal_upheld",
  "appeal_dismissed",
]);

export const clubApplicationAppealStatusEnum = pgEnum("club_application_appeal_status", [
  "pending",
  "upheld",
  "dismissed",
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
  rejectedAt: t.timestamp("rejected_at", { withTimezone: true }),
  rejectApproverId: t.uuid("reject_approver_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (cols) => [
  compositeForeignKey({
    columns: [cols.applicantId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_applications_applicant_tenant_fkey",
  }).onDelete("restrict"),
  t.index("club_applications_university_status_idx").on(cols.universityId, cols.status),
  t.index("club_applications_applicant_idx").on(cols.applicantId),
  t.uniqueIndex("club_applications_id_tenant_idx").on(cols.id, cols.universityId),
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

/** Başvuru inceleme kontrol listesi — tenant kataloğundaki madde başına yanıt. */
export const clubApplicationChecklistItems = table("club_application_checklist_items", {
  id: t.uuid().primaryKey().defaultRandom(),
  applicationId: t
    .uuid("application_id")
    .references(() => clubApplications.id, { onDelete: "cascade" })
    .notNull(),
  universityId: t
    .uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),
  itemKey: t.varchar("item_key", { length: 64 }).notNull(),
  checked: t.boolean().default(false).notNull(),
  note: t.text(),
  checkedBy: t.uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
  checkedAt: t.timestamp("checked_at", { withTimezone: true }),
  ...timestamps,
}, (cols) => [
  compositeForeignKey({
    columns: [cols.applicationId, cols.universityId],
    foreignColumns: [clubApplications.id, clubApplications.universityId],
    name: "club_application_checklist_application_tenant_fkey",
  }).onDelete("cascade"),
  t.uniqueIndex("club_application_checklist_item_idx").on(cols.applicationId, cols.itemKey),
]);

/**
 * Başvuru itirazı — öğrenci başına bir kez; kabul → pending, ret → kapalı.
 */
export const clubApplicationAppeals = table("club_application_appeals", {
  id: t.uuid().primaryKey().defaultRandom(),
  applicationId: t
    .uuid("application_id")
    .references(() => clubApplications.id, { onDelete: "cascade" })
    .notNull(),
  universityId: t
    .uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),
  applicantId: t.uuid("applicant_id").notNull(),
  note: t.text().notNull(),
  status: clubApplicationAppealStatusEnum().default("pending").notNull(),
  reviewedBy: t.uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: t.timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: t.text("review_note"),
  /** Ret kararını veren kişi itirazı inceledi — audit için işaret. */
  sameActorAsRejector: t.boolean("same_actor_as_rejector").default(false).notNull(),
  ...timestamps,
}, (cols) => [
  compositeForeignKey({
    columns: [cols.applicationId, cols.universityId],
    foreignColumns: [clubApplications.id, clubApplications.universityId],
    name: "club_application_appeals_application_tenant_fkey",
  }).onDelete("cascade"),
  compositeForeignKey({
    columns: [cols.applicantId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_application_appeals_applicant_tenant_fkey",
  }).onDelete("restrict"),
  t.uniqueIndex("club_application_appeals_application_idx").on(cols.applicationId),
]);
