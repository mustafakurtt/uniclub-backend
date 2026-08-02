import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import {
  activities,
  activityClubs,
  clubAdvisors,
  clubBoardMemberships,
  clubHandoverRecords,
  clubMembers,
} from "../../db/schema";
import type {
  HandoverBoardMemberSnapshot,
  HandoverTransferredItems,
} from "../../db/schema/handover";

export const handoverRepository = {
  findByMeetingId(generalMeetingId: string) {
    return db.query.clubHandoverRecords.findFirst({
      where: { generalMeetingId },
    });
  },

  findByIdInClub(clubId: string, handoverId: string) {
    return db.query.clubHandoverRecords.findFirst({
      where: { id: handoverId, clubId },
      with: {
        academicTerm: true,
        generalMeeting: true,
        recorder: true,
      },
    });
  },

  listForClub(clubId: string) {
    return db.query.clubHandoverRecords.findMany({
      where: { clubId },
      orderBy: { handoverAt: "desc" },
      with: {
        academicTerm: true,
        generalMeeting: true,
        recorder: true,
      },
    });
  },

  findMeetingForHandover(clubId: string, universityId: string, meetingId: string) {
    return db.query.clubGeneralMeetings.findFirst({
      where: { id: meetingId, clubId, universityId },
      with: {
        boardMemberships: { with: { user: true } },
      },
    });
  },

  findActiveBoardMemberships(clubId: string) {
    return db.query.clubBoardMemberships.findMany({
      where: { clubId, endedAt: { isNull: true } },
      with: { user: true },
    });
  },

  async collectTransferredItems(clubId: string, universityId: string): Promise<HandoverTransferredItems> {
    const pendingJoin = await db.query.clubMembers.findMany({
      where: { clubId, universityId, status: "pending", leftAt: { isNull: true } },
      columns: { userId: true },
    });

    const advisors = await db.query.clubAdvisors.findMany({
      where: { clubId, universityId, leftAt: { isNull: true } },
      columns: { userId: true },
    });

    const activityRows = await db
      .select({ activityId: activities.id })
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .where(
        and(
          eq(activityClubs.clubId, clubId),
          eq(activityClubs.role, "host"),
          eq(activityClubs.status, "accepted"),
          or(eq(activities.status, "draft"), eq(activities.status, "published"))
        )
      );

    return {
      pendingJoinRequestUserIds: pendingJoin.map((r) => r.userId),
      ongoingActivityIds: activityRows.map((r) => r.activityId),
      advisorUserIds: advisors.map((r) => r.userId),
    };
  },

  async executeHandover(params: {
    clubId: string;
    universityId: string;
    academicTermId: string;
    generalMeetingId: string;
    handoverAt: Date;
    recordedBy: string;
    outgoingBoardSnapshot: HandoverBoardMemberSnapshot[];
    incomingBoardSnapshot: HandoverBoardMemberSnapshot[];
    transferredItems: HandoverTransferredItems;
  }) {
    return db.transaction(async (tx) => {
      await tx
        .update(clubBoardMemberships)
        .set({ endedAt: params.handoverAt, updatedAt: params.handoverAt })
        .where(and(eq(clubBoardMemberships.clubId, params.clubId), isNull(clubBoardMemberships.endedAt)));

      await tx
        .update(clubBoardMemberships)
        .set({ endedAt: null, updatedAt: params.handoverAt })
        .where(eq(clubBoardMemberships.generalMeetingId, params.generalMeetingId));

      const [record] = await tx
        .insert(clubHandoverRecords)
        .values({
          clubId: params.clubId,
          universityId: params.universityId,
          academicTermId: params.academicTermId,
          generalMeetingId: params.generalMeetingId,
          handoverAt: params.handoverAt,
          recordedBy: params.recordedBy,
          outgoingBoardSnapshot: params.outgoingBoardSnapshot,
          incomingBoardSnapshot: params.incomingBoardSnapshot,
          transferredItems: params.transferredItems,
        })
        .returning();

      return record;
    });
  },
};
