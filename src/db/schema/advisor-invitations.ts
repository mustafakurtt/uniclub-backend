import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { clubs } from "./clubs";
import { compositeForeignKey } from "./helpers";

// ═══════════════════════════════════════════════
// KULÜP DANIŞMAN DAVETLERİ (rıza tabanlı atama)
// ═══════════════════════════════════════════════

export const clubAdvisorInvitationStatusEnum = pgEnum("club_advisor_invitation_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled",
]);

export const clubAdvisorInvitations = table(
  "club_advisor_invitations",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    clubId: t.uuid("club_id").notNull(),
    universityId: t
      .uuid("university_id")
      .references(() => universities.id, { onDelete: "restrict" })
      .notNull(),
    inviteeUserId: t.uuid("invitee_user_id").notNull(),
    invitedBy: t.uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    status: clubAdvisorInvitationStatusEnum().default("pending").notNull(),
    message: t.text(),
    declineReason: t.text("decline_reason"),
    expiresAt: t.timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: t.timestamp("responded_at", { withTimezone: true }),
    ...timestamps,
  },
  (cols) => [
    compositeForeignKey({
      columns: [cols.clubId, cols.universityId],
      foreignColumns: [clubs.id, clubs.universityId],
      name: "club_advisor_invitations_club_tenant_fkey",
    }).onDelete("cascade"),
    compositeForeignKey({
      columns: [cols.inviteeUserId, cols.universityId],
      foreignColumns: [users.id, users.universityId],
      name: "club_advisor_invitations_invitee_tenant_fkey",
    }).onDelete("restrict"),
    t.index("club_advisor_invitations_club_status_idx").on(cols.clubId, cols.status),
    t.index("club_advisor_invitations_invitee_status_idx").on(cols.inviteeUserId, cols.status),
    t
      .uniqueIndex("club_advisor_invitations_pending_pair_idx")
      .on(cols.clubId, cols.inviteeUserId)
      .where(sql`status = 'pending'`),
  ]
);
