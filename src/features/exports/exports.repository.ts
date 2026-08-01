import { and, asc, eq, gte, lte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  activities,
  activityAttendees,
  activityClubs,
  clubs,
  clubMembers,
  users,
} from "../../db/schema";
import { EXPORT_MAX_ROWS } from "./exports.constants";
import type {
  ActivitiesExportParams,
  ClubMembersExportParams,
  ClubsExportParams,
} from "./exports.schema";
import type { ReportRow } from "./reports/report.types";

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
};
