import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { auditLogs, users } from "../../db/schema";
import type { AuditDecisionPageCursor } from "./audit-inspection.cursor";
import { decisionAuditWhereClause } from "./audit-decisions";
import type { AuditActivitySummary } from "./audit-inspection.types";

type DateRange = { from: Date; to: Date };

export const auditInspectionRepository = {
  async countActivitySummary(universityId: string, range: DateRange): Promise<AuditActivitySummary["counts"]> {
    // sql`` içinde Date bağlama postgres sürücüsünde hata verir — ISO string kullan.
    const from = range.from.toISOString();
    const to = range.to.toISOString();

    const [row] = await db
      .select({
        applicationsSubmitted: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_applications
          WHERE university_id = ${universityId}
            AND created_at >= ${from}::timestamptz
            AND created_at <= ${to}::timestamptz
        )`,
        applicationsApproved: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_application_events e
          INNER JOIN club_applications a ON a.id = e.application_id
          WHERE a.university_id = ${universityId}
            AND e.event_type = 'approved'
            AND e.created_at >= ${from}::timestamptz
            AND e.created_at <= ${to}::timestamptz
        )`,
        applicationsRejected: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_application_events e
          INNER JOIN club_applications a ON a.id = e.application_id
          WHERE a.university_id = ${universityId}
            AND e.event_type = 'rejected'
            AND e.created_at >= ${from}::timestamptz
            AND e.created_at <= ${to}::timestamptz
        )`,
        applicationsRevisionRequested: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_application_events e
          INNER JOIN club_applications a ON a.id = e.application_id
          WHERE a.university_id = ${universityId}
            AND e.event_type = 'revision_requested'
            AND e.created_at >= ${from}::timestamptz
            AND e.created_at <= ${to}::timestamptz
        )`,
        clubsCreated: sql<number>`(
          SELECT cast(count(*) AS int) FROM clubs
          WHERE university_id = ${universityId}
            AND created_at >= ${from}::timestamptz
            AND created_at <= ${to}::timestamptz
        )`,
        clubsClosed: sql<number>`(
          SELECT cast(count(*) AS int) FROM clubs
          WHERE university_id = ${universityId}
            AND status = 'archived'
            AND updated_at >= ${from}::timestamptz
            AND updated_at <= ${to}::timestamptz
        )`,
        generalMeetingsHeld: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_general_meetings
          WHERE university_id = ${universityId}
            AND held_at >= ${from}::timestamptz
            AND held_at <= ${to}::timestamptz
        )`,
        handoversRecorded: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_handover_records
          WHERE university_id = ${universityId}
            AND handover_at >= ${from}::timestamptz
            AND handover_at <= ${to}::timestamptz
        )`,
        advisorInvitationsAccepted: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_advisor_invitations
          WHERE university_id = ${universityId}
            AND status = 'accepted'
            AND responded_at IS NOT NULL
            AND responded_at >= ${from}::timestamptz
            AND responded_at <= ${to}::timestamptz
        )`,
        advisorInvitationsDeclined: sql<number>`(
          SELECT cast(count(*) AS int) FROM club_advisor_invitations
          WHERE university_id = ${universityId}
            AND status = 'declined'
            AND responded_at IS NOT NULL
            AND responded_at >= ${from}::timestamptz
            AND responded_at <= ${to}::timestamptz
        )`,
        activitiesHeld: sql<number>`(
          SELECT cast(count(*) AS int) FROM activities act
          INNER JOIN activity_clubs ac ON ac.activity_id = act.id AND ac.role = 'host'
          INNER JOIN clubs c ON c.id = ac.club_id
          WHERE c.university_id = ${universityId}
            AND act.status = 'published'
            AND act.starts_at >= ${from}::timestamptz
            AND act.starts_at <= ${to}::timestamptz
        )`,
      })
      .from(sql`(SELECT 1) AS _audit_summary_probe`);

    return {
      applicationsSubmitted: row?.applicationsSubmitted ?? 0,
      applicationsApproved: row?.applicationsApproved ?? 0,
      applicationsRejected: row?.applicationsRejected ?? 0,
      applicationsRevisionRequested: row?.applicationsRevisionRequested ?? 0,
      clubsCreated: row?.clubsCreated ?? 0,
      clubsClosed: row?.clubsClosed ?? 0,
      generalMeetingsHeld: row?.generalMeetingsHeld ?? 0,
      handoversRecorded: row?.handoversRecorded ?? 0,
      advisorInvitationsAccepted: row?.advisorInvitationsAccepted ?? 0,
      advisorInvitationsDeclined: row?.advisorInvitationsDeclined ?? 0,
      activitiesHeld: row?.activitiesHeld ?? 0,
    };
  },

  async listDecisions(
    universityId: string,
    range: DateRange,
    limit: number,
    cursor?: AuditDecisionPageCursor,
    filter?: { actorId?: string; targetId?: string }
  ) {
    const conditions = [
      eq(auditLogs.universityId, universityId),
      gte(auditLogs.createdAt, range.from),
      lte(auditLogs.createdAt, range.to),
      decisionAuditWhereClause(),
    ];

    if (cursor) {
      // Alt sorgu — cursor'daki JS Date mikrosaniye kaybını önler; tuple tam DB değerleriyle kıyaslanır.
      conditions.push(
        sql`(${auditLogs.createdAt}, ${auditLogs.id}) < (
          SELECT l.created_at, l.id FROM audit_logs l WHERE l.id = ${cursor.id}
        )`
      );
    }
    if (filter?.actorId) conditions.push(eq(auditLogs.actorId, filter.actorId));
    if (filter?.targetId) conditions.push(eq(auditLogs.targetId, filter.targetId));

    const rows = await db
      .select({
        log: auditLogs,
        actor: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          deletedAt: users.deletedAt,
        },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit);

    return rows.map(({ log, actor }) => ({ ...log, actor }));
  },
};
