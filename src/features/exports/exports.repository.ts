import { and, asc, eq, gte, inArray, lte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  activities,
  activityAttendees,
  activityClubs,
  clubAdvisors,
  clubs,
  clubMembers,
  users,
} from "../../db/schema";
import type { HandoverBoardMemberSnapshot } from "../../db/schema/handover";
import { EXPORT_MAX_ROWS } from "./exports.constants";
import type {
  ActivitiesExportParams,
  ClubMembersExportParams,
  ClubsExportParams,
} from "./exports.schema";
import type { ReportRow } from "./reports/report.types";
import type { GeneralMeetingMinutesBoardMember } from "./reports/report.types";

const BOARD_TITLE_LABELS_TR: Record<string, string> = {
  president: "Başkan",
  vice_president: "Başkan Yardımcısı",
  secretary: "Sekreter",
  treasurer: "Sayman",
  member: "Üye",
};

const MEETING_TYPE_LABELS_TR: Record<string, string> = {
  ordinary: "Olağan",
  extraordinary: "Olağanüstü",
};

const BOARD_TYPE_LABELS_TR: Record<string, string> = {
  management: "Yönetim Kurulu",
  audit: "Denetleme Kurulu",
};

const SEAT_TYPE_LABELS_TR: Record<string, string> = {
  principal: "Asil",
  alternate: "Yedek",
};

function formatHeldAtLabel(date: Date): string {
  const iso = date.toISOString();
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  const [hh, mm] = timePart.split(":");
  return `${d}.${m}.${y} ${hh}:${mm}`;
}

function mapBoardMember(
  row: {
    boardType: "management" | "audit";
    seatType: "principal" | "alternate";
    title: string;
    user: { firstName: string; lastName: string } | null;
  }
): GeneralMeetingMinutesBoardMember {
  return {
    fullName: row.user ? `${row.user.firstName} ${row.user.lastName}` : "—",
    titleLabel: BOARD_TITLE_LABELS_TR[row.title] ?? row.title,
    boardType: row.boardType,
    seatType: row.seatType,
  };
}

const BOARD_TITLE_ORDER = ["president", "vice_president", "secretary", "treasurer", "member"];

function sortMemberships<T extends { title: string; userId: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const ai = BOARD_TITLE_ORDER.indexOf(a.title);
    const bi = BOARD_TITLE_ORDER.indexOf(b.title);
    const aRank = ai === -1 ? BOARD_TITLE_ORDER.length : ai;
    const bRank = bi === -1 ? BOARD_TITLE_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.userId.localeCompare(b.userId);
  });
}

function sortSnapshotMembers(snapshot: HandoverBoardMemberSnapshot[]): HandoverBoardMemberSnapshot[] {
  return [...snapshot].sort((a, b) => {
    const ai = BOARD_TITLE_ORDER.indexOf(a.title);
    const bi = BOARD_TITLE_ORDER.indexOf(b.title);
    const aRank = ai === -1 ? BOARD_TITLE_ORDER.length : ai;
    const bRank = bi === -1 ? BOARD_TITLE_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.userId.localeCompare(b.userId);
  });
}

function mapSnapshotMember(row: HandoverBoardMemberSnapshot): GeneralMeetingMinutesBoardMember {
  return {
    fullName: row.fullName ?? "—",
    titleLabel: BOARD_TITLE_LABELS_TR[row.title] ?? row.title,
    boardType: row.boardType,
    seatType: row.seatType,
  };
}

function groupBoardMembers(snapshot: HandoverBoardMemberSnapshot[]) {
  const members = sortSnapshotMembers(snapshot).map(mapSnapshotMember);
  return {
    managementPrincipal: members.filter((m) => m.boardType === "management" && m.seatType === "principal"),
    managementAlternate: members.filter((m) => m.boardType === "management" && m.seatType === "alternate"),
    auditPrincipal: members.filter((m) => m.boardType === "audit" && m.seatType === "principal"),
    auditAlternate: members.filter((m) => m.boardType === "audit" && m.seatType === "alternate"),
  };
}

function findPresidentName(snapshot: HandoverBoardMemberSnapshot[]): string | null {
  const president = snapshot.find(
    (m) => m.boardType === "management" && m.seatType === "principal" && m.title === "president"
  );
  return president?.fullName ?? null;
}

function snapshotToRows(snapshot: HandoverBoardMemberSnapshot[], phaseLabel: string): ReportRow[] {
  return sortSnapshotMembers(snapshot).map((m) => ({
    fullName: m.fullName ?? "—",
    titleLabel: BOARD_TITLE_LABELS_TR[m.title] ?? m.title,
    seatLabel: SEAT_TYPE_LABELS_TR[m.seatType] ?? m.seatType,
    boardLabel: BOARD_TYPE_LABELS_TR[m.boardType] ?? m.boardType,
    phaseLabel,
  }));
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mapRows<T extends Record<string, unknown>>(rows: T[], mapping: (row: T) => ReportRow): ReportRow[] {
  return rows.map(mapping);
}

export const exportsRepository = {
  findUniversity(universityId: string) {
    return db.query.universities.findFirst({
      where: { id: universityId },
      columns: {
        id: true,
        name: true,
        slug: true,
        primaryColor: true,
      },
    });
  },

  findClubInUniversity(universityId: string, clubId: string) {
    return db.query.clubs.findFirst({
      where: { id: clubId, universityId },
      columns: { id: true, name: true },
    });
  },

  async fetchClubsRows(universityId: string, params: ClubsExportParams): Promise<ReportRow[]> {
    const filters: SQL[] = [eq(clubs.universityId, universityId)];
    if (params.status) filters.push(eq(clubs.status, params.status));
    if (params.createdFrom) filters.push(gte(clubs.createdAt, params.createdFrom));
    if (params.createdTo) filters.push(lte(clubs.createdAt, params.createdTo));

    const rows = await db
      .select({
        name: clubs.name,
        slug: clubs.slug,
        status: clubs.status,
        joinPolicy: clubs.joinPolicy,
        createdAt: clubs.createdAt,
        id: clubs.id,
      })
      .from(clubs)
      .where(and(...filters))
      .orderBy(asc(clubs.id))
      .limit(EXPORT_MAX_ROWS + 1);

    return mapRows(rows, (r) => ({
      name: r.name,
      slug: r.slug,
      status: r.status,
      joinPolicy: r.joinPolicy,
      createdAt: toIso(r.createdAt),
    }));
  },

  async fetchClubMembersRows(
    universityId: string,
    params: ClubMembersExportParams
  ): Promise<ReportRow[]> {
    const filters: SQL[] = [
      eq(clubMembers.clubId, params.clubId),
      eq(clubMembers.universityId, universityId),
    ];
    if (params.role) filters.push(eq(clubMembers.role, params.role));
    if (params.status) filters.push(eq(clubMembers.status, params.status));

    const rows = await db
      .select({
        studentNumber: users.studentNumber,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: clubMembers.role,
        status: clubMembers.status,
        joinedAt: clubMembers.joinedAt,
        userId: users.id,
      })
      .from(clubMembers)
      .innerJoin(users, eq(users.id, clubMembers.userId))
      .where(and(...filters))
      .orderBy(asc(clubMembers.joinedAt), asc(users.id))
      .limit(EXPORT_MAX_ROWS + 1);

    return mapRows(rows, (r) => ({
      studentNumber: r.studentNumber ?? null,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      role: r.role,
      status: r.status,
      joinedAt: toIso(r.joinedAt),
    }));
  },

  async fetchActivitiesRows(
    universityId: string,
    params: ActivitiesExportParams
  ): Promise<ReportRow[]> {
    const filters: SQL[] = [
      eq(clubs.universityId, universityId),
      eq(activityClubs.role, "host"),
      eq(activityClubs.status, "accepted"),
    ];
    if (params.status) filters.push(eq(activities.status, params.status));
    if (params.from) filters.push(gte(activities.startsAt, params.from));
    if (params.to) filters.push(lte(activities.startsAt, params.to));
    if (params.clubId) filters.push(eq(clubs.id, params.clubId));

    const rows = await db
      .selectDistinct({
        id: activities.id,
        title: activities.title,
        hostClubName: clubs.name,
        startsAt: activities.startsAt,
        endsAt: activities.endsAt,
        location: activities.location,
        status: activities.status,
      })
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .where(and(...filters))
      .orderBy(asc(activities.startsAt), asc(activities.id))
      .limit(EXPORT_MAX_ROWS + 1);

    return mapRows(rows, (r) => ({
      title: r.title,
      hostClubName: r.hostClubName,
      startsAt: toIso(r.startsAt),
      endsAt: toIso(r.endsAt),
      location: r.location ?? null,
      status: r.status,
    }));
  },

  async fetchAnnualActivityReport(universityId: string, year: number) {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const clubCountRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clubs)
      .where(and(eq(clubs.universityId, universityId), eq(clubs.status, "approved")));

    const activityStats = await db
      .select({
        activityCount: sql<number>`count(distinct ${activities.id})::int`,
        participationCount: sql<number>`count(${activityAttendees.userId})::int`,
      })
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .leftJoin(activityAttendees, eq(activityAttendees.activityId, activities.id))
      .where(
        and(
          eq(clubs.universityId, universityId),
          eq(activityClubs.role, "host"),
          eq(activityClubs.status, "accepted"),
          eq(activities.status, "published"),
          gte(activities.startsAt, yearStart),
          lt(activities.startsAt, yearEnd)
        )
      );

    const clubRows = await db
      .select({
        clubId: clubs.id,
        clubName: clubs.name,
        activityCount: sql<number>`count(distinct ${activities.id})::int`,
        participationCount: sql<number>`count(${activityAttendees.userId})::int`,
      })
      .from(clubs)
      .leftJoin(
        activityClubs,
        and(eq(activityClubs.clubId, clubs.id), eq(activityClubs.role, "host"), eq(activityClubs.status, "accepted"))
      )
      .leftJoin(
        activities,
        and(
          eq(activities.id, activityClubs.activityId),
          eq(activities.status, "published"),
          gte(activities.startsAt, yearStart),
          lt(activities.startsAt, yearEnd)
        )
      )
      .leftJoin(activityAttendees, eq(activityAttendees.activityId, activities.id))
      .where(and(eq(clubs.universityId, universityId), eq(clubs.status, "approved")))
      .groupBy(clubs.id, clubs.name)
      .orderBy(asc(clubs.id));

    return {
      summary: {
        year,
        clubCount: clubCountRow[0]?.count ?? 0,
        activityCount: activityStats[0]?.activityCount ?? 0,
        totalParticipation: activityStats[0]?.participationCount ?? 0,
      },
      clubRows: mapRows(clubRows, (r) => ({
        clubName: r.clubName,
        activityCount: r.activityCount,
        participationCount: r.participationCount,
      })),
    };
  },

  async fetchApplicationDecisionMinutes(universityId: string, applicationId: string) {
    const application = await db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
      columns: {
        id: true,
        proposedName: true,
        description: true,
        status: true,
      },
      with: {
        applicant: {
          columns: { firstName: true, lastName: true, email: true },
        },
        approvals: {
          columns: {
            step: true,
            approverRole: true,
            status: true,
            note: true,
            reviewedAt: true,
          },
          with: {
            approver: {
              columns: { firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!application || !application.applicant) return null;

    const approvals = [...application.approvals].sort((a, b) => a.step - b.step);

    return {
      header: {
        proposedName: application.proposedName,
        description: application.description,
        applicantName: `${application.applicant.firstName} ${application.applicant.lastName}`,
        applicantEmail: application.applicant.email,
        applicationStatus: application.status,
      },
      approvalRows: approvals.map((row) => ({
        step: row.step,
        approverRole: row.approverRole,
        approverName: row.approver
          ? `${row.approver.firstName} ${row.approver.lastName}`
          : null,
        decision: row.status,
        reviewedAt: toIso(row.reviewedAt),
        note: row.note,
      })),
    };
  },

  async fetchGeneralMeetingMinutes(universityId: string, meetingId: string) {
    const meeting = await db.query.clubGeneralMeetings.findFirst({
      where: { id: meetingId, universityId },
      with: {
        club: { columns: { id: true, name: true } },
        boardMemberships: {
          with: {
            user: { columns: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!meeting?.club) return null;

    const advisorRow = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(clubAdvisors)
      .innerJoin(users, eq(users.id, clubAdvisors.userId))
      .where(
        and(eq(clubAdvisors.clubId, meeting.clubId), eq(clubAdvisors.universityId, universityId))
      )
      .orderBy(asc(users.id))
      .limit(1);

    const sortedMemberships = sortMemberships(meeting.boardMemberships);

    const boardMembers = sortedMemberships.map((m) =>
      mapBoardMember({
        boardType: m.boardType,
        seatType: m.seatType,
        title: m.title,
        user: m.user,
      })
    );

    const managementPrincipal = boardMembers.filter(
      (m) => m.boardType === "management" && m.seatType === "principal"
    );
    const managementAlternate = boardMembers.filter(
      (m) => m.boardType === "management" && m.seatType === "alternate"
    );
    const auditPrincipal = boardMembers.filter(
      (m) => m.boardType === "audit" && m.seatType === "principal"
    );
    const auditAlternate = boardMembers.filter(
      (m) => m.boardType === "audit" && m.seatType === "alternate"
    );

    const advisor = advisorRow[0];
    const advisorName = advisor ? `${advisor.firstName} ${advisor.lastName}` : null;

    const header = {
      clubName: meeting.club.name,
      advisorName,
      meetingTypeLabel: MEETING_TYPE_LABELS_TR[meeting.meetingType] ?? meeting.meetingType,
      heldAtLabel: formatHeldAtLabel(meeting.heldAt),
      location: meeting.location,
      decisions: meeting.decisions,
      managementPrincipal,
      managementAlternate,
      auditPrincipal,
      auditAlternate,
    };

    const rows: ReportRow[] = boardMembers.map((m) => ({
      fullName: m.fullName,
      titleLabel: m.titleLabel,
      seatLabel: SEAT_TYPE_LABELS_TR[m.seatType] ?? m.seatType,
      boardLabel: BOARD_TYPE_LABELS_TR[m.boardType] ?? m.boardType,
    }));

    return { header, rows };
  },

  async fetchClubHandoverMinutes(universityId: string, handoverId: string) {
    const record = await db.query.clubHandoverRecords.findFirst({
      where: { id: handoverId, universityId },
      with: {
        club: { columns: { id: true, name: true } },
        academicTerm: { columns: { name: true } },
        generalMeeting: true,
      },
    });

    if (!record?.club || !record.academicTerm || !record.generalMeeting) return null;

    const advisorRow = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(clubAdvisors)
      .innerJoin(users, eq(users.id, clubAdvisors.userId))
      .where(
        and(eq(clubAdvisors.clubId, record.clubId), eq(clubAdvisors.universityId, universityId))
      )
      .orderBy(asc(users.id))
      .limit(1);

    const advisor = advisorRow[0];
    const advisorName = advisor ? `${advisor.firstName} ${advisor.lastName}` : null;

    const items = record.transferredItems;
    const userIds = [
      ...items.pendingJoinRequestUserIds,
      ...items.advisorUserIds,
    ];
    const userRows =
      userIds.length > 0
        ? await db
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
    const userNameById = new Map(
      userRows.map((u) => [u.id, `${u.firstName} ${u.lastName}`])
    );

    const activityRows =
      items.ongoingActivityIds.length > 0
        ? await db
            .select({ id: activities.id, title: activities.title })
            .from(activities)
            .where(inArray(activities.id, items.ongoingActivityIds))
        : [];
    const activityTitleById = new Map(activityRows.map((a) => [a.id, a.title]));

    const pendingJoinRequestLabels = items.pendingJoinRequestUserIds.map(
      (id) => userNameById.get(id) ?? "—"
    );
    const ongoingActivityLabels = items.ongoingActivityIds.map(
      (id) => activityTitleById.get(id) ?? "—"
    );
    const advisorLabels = items.advisorUserIds.map((id) => userNameById.get(id) ?? "—");

    const outgoing = groupBoardMembers(record.outgoingBoardSnapshot);
    const incoming = groupBoardMembers(record.incomingBoardSnapshot);

    const header = {
      clubName: record.club.name,
      academicTermName: record.academicTerm.name,
      advisorName,
      handoverAtLabel: formatHeldAtLabel(record.handoverAt),
      meetingHeldAtLabel: formatHeldAtLabel(record.generalMeeting.heldAt),
      meetingLocation: record.generalMeeting.location,
      outgoingManagementPrincipal: outgoing.managementPrincipal,
      outgoingManagementAlternate: outgoing.managementAlternate,
      outgoingAuditPrincipal: outgoing.auditPrincipal,
      outgoingAuditAlternate: outgoing.auditAlternate,
      incomingManagementPrincipal: incoming.managementPrincipal,
      incomingManagementAlternate: incoming.managementAlternate,
      incomingAuditPrincipal: incoming.auditPrincipal,
      incomingAuditAlternate: incoming.auditAlternate,
      pendingJoinRequestLabels,
      ongoingActivityLabels,
      advisorLabels,
      outgoingPresidentName: findPresidentName(record.outgoingBoardSnapshot),
      incomingPresidentName: findPresidentName(record.incomingBoardSnapshot),
    };

    const rows: ReportRow[] = [
      ...snapshotToRows(record.outgoingBoardSnapshot, "Devreden"),
      ...snapshotToRows(record.incomingBoardSnapshot, "Devralan"),
    ];

    return { header, rows };
  },
};
