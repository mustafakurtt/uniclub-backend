import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { createdAtColumn, compositeForeignKey } from "./helpers";
import { clubs, clubRoleEnum } from "./clubs";
import { users } from "./users";
import { academicTerms } from "./academic-terms";

// ═══════════════════════════════════════════════
// ÜYELİK TARİHÇESİ (append-only olaylar)
// ═══════════════════════════════════════════════
export const clubMembershipEventTypeEnum = pgEnum("club_membership_event_type", [
  "joined",
  "role_changed",
  "removed",
  "left",
  "join_rejected",
]);

/**
 * Kulüp üyelik olayları — `club_members` güncel durumu tutar; tarihçe burada.
 * Satırlar güncellenmez/silinmez (append-only).
 */
export const clubMembershipEvents = table("club_membership_events", {
  id: t.uuid().primaryKey().defaultRandom(),
  clubId: t.uuid("club_id").notNull(),
  userId: t.uuid("user_id").notNull(),
  universityId: t.uuid("university_id").notNull(),
  eventType: clubMembershipEventTypeEnum("event_type").notNull(),
  role: clubRoleEnum(),
  previousRole: clubRoleEnum("previous_role"),
  academicTermId: t
    .uuid("academic_term_id")
    .references(() => academicTerms.id, { onDelete: "restrict" }),
  actorId: t.uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  occurredAt: t.timestamp("occurred_at", { withTimezone: true }).notNull(),
  ...createdAtColumn,
}, (cols) => [
  compositeForeignKey({
    columns: [cols.clubId, cols.universityId],
    foreignColumns: [clubs.id, clubs.universityId],
    name: "club_membership_events_club_tenant_fkey",
  }).onDelete("cascade"),
  compositeForeignKey({
    columns: [cols.userId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_membership_events_user_tenant_fkey",
  }).onDelete("cascade"),
  t.index("club_membership_events_club_occurred_idx").on(cols.clubId, cols.occurredAt.desc()),
  t.index("club_membership_events_term_idx").on(cols.academicTermId),
]);
