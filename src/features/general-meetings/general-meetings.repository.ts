import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  clubBoardMemberships,
  clubGeneralMeetingAttendees,
  clubGeneralMeetings,
  clubMembers,
} from "../../db/schema";
import type { CreateGeneralMeetingDTO } from "./general-meetings.schema";

type BoardMemberInput = CreateGeneralMeetingDTO["boardMembers"][number];

class GeneralMeetingsRepository {
  findTermInUniversity(universityId: string, termId: string) {
    return db.query.academicTerms.findFirst({
      where: { id: termId, universityId },
    });
  }

  findMeetingInClub(clubId: string, meetingId: string) {
    return db.query.clubGeneralMeetings.findFirst({
      where: { id: meetingId, clubId },
      with: {
        academicTerm: true,
        recorder: true,
        attendees: { with: { user: true } },
        boardMemberships: { with: { user: true } },
      },
    });
  }

  listMeetingsForClub(clubId: string) {
    return db.query.clubGeneralMeetings.findMany({
      where: { clubId },
      orderBy: { heldAt: "desc" },
      with: {
        academicTerm: true,
      },
    });
  }

  async countAttendeesByMeetingIds(meetingIds: string[]): Promise<Map<string, number>> {
    if (meetingIds.length === 0) return new Map();
    const rows = await db
      .select({
        meetingId: clubGeneralMeetingAttendees.meetingId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(clubGeneralMeetingAttendees)
      .where(inArray(clubGeneralMeetingAttendees.meetingId, meetingIds))
      .groupBy(clubGeneralMeetingAttendees.meetingId);
    return new Map(rows.map((r) => [r.meetingId, r.count]));
  }

  findActiveBoardMemberships(clubId: string) {
    return db.query.clubBoardMemberships.findMany({
      where: { clubId, endedAt: { isNull: true } },
      with: { user: true },
    });
  }

  countApprovedMembers(clubId: string) {
    return db.query.clubMembers.findMany({
      where: { clubId, status: "approved", leftAt: { isNull: true } },
      columns: { userId: true },
    });
  }

  async createMeeting(
    clubId: string,
    universityId: string,
    recordedBy: string,
    data: CreateGeneralMeetingDTO,
    boardTypesToReplace: ("management" | "audit")[]
  ) {
    return db.transaction(async (tx) => {
      const [meeting] = await tx
        .insert(clubGeneralMeetings)
        .values({
          clubId,
          universityId,
          academicTermId: data.academicTermId,
          meetingType: data.meetingType,
          heldAt: new Date(data.heldAt),
          location: data.location,
          decisions: data.decisions,
          recordedBy,
        })
        .returning();

      if (data.attendeeUserIds.length > 0) {
        await tx.insert(clubGeneralMeetingAttendees).values(
          data.attendeeUserIds.map((userId) => ({
            meetingId: meeting.id,
            clubId,
            userId,
            universityId,
          }))
        );
      }

      const now = new Date();
      if (boardTypesToReplace.length > 0) {
        await tx
          .update(clubBoardMemberships)
          .set({ endedAt: now, updatedAt: now })
          .where(
            and(
              eq(clubBoardMemberships.clubId, clubId),
              isNull(clubBoardMemberships.endedAt),
              inArray(clubBoardMemberships.boardType, boardTypesToReplace)
            )
          );
      }

      let boardRows: (typeof clubBoardMemberships.$inferSelect)[] = [];
      if (data.boardMembers.length > 0) {
        boardRows = await tx
          .insert(clubBoardMemberships)
          .values(
            data.boardMembers.map((member: BoardMemberInput) => ({
              clubId,
              universityId,
              generalMeetingId: meeting.id,
              userId: member.userId,
              boardType: member.boardType,
              seatType: member.seatType,
              title: member.title,
            }))
          )
          .returning();
      }

      return { meeting, boardRows };
    });
  }

  findPresidentMember(clubId: string) {
    return db.query.clubMembers.findFirst({
      where: {
        clubId,
        role: "president",
        status: "approved",
        leftAt: { isNull: true },
      },
    });
  }

  async updateMemberRole(clubId: string, userId: string, role: "member" | "officer" | "president") {
    const [row] = await db
      .update(clubMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .returning();
    return row;
  }

  findMembership(clubId: string, userId: string) {
    return db.query.clubMembers.findFirst({
      where: { clubId, userId, leftAt: { isNull: true } },
    });
  }
}

export const generalMeetingsRepository = new GeneralMeetingsRepository();
