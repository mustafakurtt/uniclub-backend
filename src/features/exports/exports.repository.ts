import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  activities,
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
};
