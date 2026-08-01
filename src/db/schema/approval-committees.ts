import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { compositeForeignKey } from "./helpers";

// ═══════════════════════════════════════════════
// ONAY KURULLARI (tenant kapsamlı, kalıcı)
// ═══════════════════════════════════════════════

export const clubApplicationCommitteeVoteEnum = pgEnum("club_application_committee_vote", [
  "approve",
  "reject",
]);

export const approvalCommittees = table(
  "approval_committees",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    universityId: t
      .uuid("university_id")
      .references(() => universities.id, { onDelete: "restrict" })
      .notNull(),
    name: t.varchar({ length: 128 }).notNull(),
    isActive: t.boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (cols) => [
    t.unique("approval_committees_id_university_unique").on(cols.id, cols.universityId),
    t.index("approval_committees_university_idx").on(cols.universityId),
  ]
);

export const approvalCommitteeMembers = table(
  "approval_committee_members",
  {
    committeeId: t
      .uuid("committee_id")
      .references(() => approvalCommittees.id, { onDelete: "cascade" })
      .notNull(),
    userId: t.uuid("user_id").notNull(),
    universityId: t.uuid("university_id").notNull(),
    ...timestamps,
  },
  (cols) => [
    t.primaryKey({ columns: [cols.committeeId, cols.userId] }),
    compositeForeignKey({
      columns: [cols.userId, cols.universityId],
      foreignColumns: [users.id, users.universityId],
      name: "approval_committee_members_user_tenant_fkey",
    }).onDelete("restrict"),
    compositeForeignKey({
      columns: [cols.committeeId, cols.universityId],
      foreignColumns: [approvalCommittees.id, approvalCommittees.universityId],
      name: "approval_committee_members_committee_tenant_fkey",
    }).onDelete("cascade"),
  ]
);
