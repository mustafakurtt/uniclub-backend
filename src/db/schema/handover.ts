import { pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { clubs } from "./clubs";
import { users } from "./users";
import { academicTerms } from "./academic-terms";
import { clubGeneralMeetings } from "./general-meetings";
import { compositeForeignKey } from "./helpers";

/** Kurul üyesi anlık görüntüsü — devir teslim kaydında dondurulur. */
export type HandoverBoardMemberSnapshot = {
  userId: string;
  boardType: "management" | "audit";
  seatType: "principal" | "alternate";
  title: string;
  fullName: string | null;
};

/** Devredilen sorumluluk kalemleri (envanter bu turda yok). */
export type HandoverTransferredItems = {
  pendingJoinRequestUserIds: string[];
  ongoingActivityIds: string[];
  advisorUserIds: string[];
};

/**
 * Dönemsel devir teslim kaydı (T1.3) — genel kurul kararına dayanır.
 * Kurul görev süresi kapanışı ve yeni kurul başlangıcı bu kayıtla resmileşir.
 */
export const clubHandoverRecords = table(
  "club_handover_records",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    clubId: t.uuid("club_id").notNull(),
    universityId: t.uuid("university_id").notNull(),
    academicTermId: t
      .uuid("academic_term_id")
      .references(() => academicTerms.id, { onDelete: "restrict" })
      .notNull(),
    generalMeetingId: t
      .uuid("general_meeting_id")
      .references(() => clubGeneralMeetings.id, { onDelete: "restrict" })
      .notNull(),
    handoverAt: t.timestamp("handover_at", { withTimezone: true }).notNull(),
    recordedBy: t.uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
    outgoingBoardSnapshot: t.jsonb("outgoing_board_snapshot").$type<HandoverBoardMemberSnapshot[]>().notNull(),
    incomingBoardSnapshot: t.jsonb("incoming_board_snapshot").$type<HandoverBoardMemberSnapshot[]>().notNull(),
    transferredItems: t.jsonb("transferred_items").$type<HandoverTransferredItems>().notNull(),
    ...timestamps,
  },
  (cols) => [
    compositeForeignKey({
      columns: [cols.clubId, cols.universityId],
      foreignColumns: [clubs.id, clubs.universityId],
      name: "club_handover_records_club_tenant_fkey",
    }).onDelete("cascade"),
    t.uniqueIndex("club_handover_records_meeting_unique").on(cols.generalMeetingId),
    t.index("club_handover_records_club_idx").on(cols.clubId, cols.handoverAt.desc()),
  ]
);
