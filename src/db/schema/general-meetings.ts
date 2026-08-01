import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { clubs } from "./clubs";
import { users } from "./users";
import { academicTerms } from "./academic-terms";
import { compositeForeignKey } from "./helpers";

// ═══════════════════════════════════════════════
// GENEL KURUL VE KURUL ÜYELİĞİ (T1.6 temel)
// ═══════════════════════════════════════════════

export const generalMeetingTypeEnum = pgEnum("general_meeting_type", ["ordinary", "extraordinary"]);

export const clubBoardTypeEnum = pgEnum("club_board_type", ["management", "audit"]);

export const clubBoardSeatTypeEnum = pgEnum("club_board_seat_type", ["principal", "alternate"]);

/** Yönetim kurulu unvanları + denetim kurulu genel üye. */
export const clubBoardTitleEnum = pgEnum("club_board_title", [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "member",
]);

export const clubGeneralMeetings = table(
  "club_general_meetings",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    clubId: t.uuid("club_id").notNull(),
    universityId: t.uuid("university_id").notNull(),
    academicTermId: t.uuid("academic_term_id").notNull(),
    meetingType: generalMeetingTypeEnum("meeting_type").notNull(),
    heldAt: t.timestamp("held_at", { withTimezone: true }).notNull(),
    location: t.varchar({ length: 256 }).notNull(),
    /** Alınan kararlar — serbest metin (tutanak PDF bu turda yok). */
    decisions: t.text().notNull(),
    recordedBy: t.uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
    ...timestamps,
  },
  (cols) => [
    compositeForeignKey({
      columns: [cols.clubId, cols.universityId],
      foreignColumns: [clubs.id, clubs.universityId],
      name: "club_general_meetings_club_tenant_fkey",
    }).onDelete("cascade"),
    compositeForeignKey({
      columns: [cols.academicTermId, cols.universityId],
      foreignColumns: [academicTerms.id, academicTerms.universityId],
      name: "club_general_meetings_term_tenant_fkey",
    }).onDelete("restrict"),
    t.index("club_general_meetings_club_held_idx").on(cols.clubId, cols.heldAt.desc()),
  ]
);

export const clubGeneralMeetingAttendees = table(
  "club_general_meeting_attendees",
  {
    meetingId: t
      .uuid("meeting_id")
      .references(() => clubGeneralMeetings.id, { onDelete: "cascade" })
      .notNull(),
    clubId: t.uuid("club_id").notNull(),
    userId: t.uuid("user_id").notNull(),
    universityId: t.uuid("university_id").notNull(),
    ...timestamps,
  },
  (cols) => [
    t.primaryKey({ columns: [cols.meetingId, cols.userId] }),
    compositeForeignKey({
      columns: [cols.clubId, cols.universityId],
      foreignColumns: [clubs.id, clubs.universityId],
      name: "club_gm_attendees_club_tenant_fkey",
    }).onDelete("cascade"),
    compositeForeignKey({
      columns: [cols.userId, cols.universityId],
      foreignColumns: [users.id, users.universityId],
      name: "club_gm_attendees_user_tenant_fkey",
    }).onDelete("restrict"),
  ]
);

/**
 * Kurul üyeliği — yönetim/denetleme, asil/yedek. `endedAt` NULL = aktif görev.
 * Seçim genel kurul kaydına bağlanır (`generalMeetingId`).
 */
export const clubBoardMemberships = table(
  "club_board_memberships",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    clubId: t.uuid("club_id").notNull(),
    universityId: t.uuid("university_id").notNull(),
    generalMeetingId: t
      .uuid("general_meeting_id")
      .references(() => clubGeneralMeetings.id, { onDelete: "restrict" })
      .notNull(),
    userId: t.uuid("user_id").notNull(),
    boardType: clubBoardTypeEnum("board_type").notNull(),
    seatType: clubBoardSeatTypeEnum("seat_type").notNull(),
    title: clubBoardTitleEnum().notNull(),
    endedAt: t.timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (cols) => [
    compositeForeignKey({
      columns: [cols.clubId, cols.universityId],
      foreignColumns: [clubs.id, clubs.universityId],
      name: "club_board_memberships_club_tenant_fkey",
    }).onDelete("cascade"),
    compositeForeignKey({
      columns: [cols.userId, cols.universityId],
      foreignColumns: [users.id, users.universityId],
      name: "club_board_memberships_user_tenant_fkey",
    }).onDelete("restrict"),
    t.index("club_board_memberships_club_active_idx").on(cols.clubId, cols.endedAt),
    t.index("club_board_memberships_meeting_idx").on(cols.generalMeetingId),
  ]
);
