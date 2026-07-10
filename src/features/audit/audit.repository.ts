import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { AuditLog, AuditLogListItem, CreateAuditLogPayload } from "./audit.types";

export interface ListAuditLogsFilter {
  actorId?: string;
  action?: string;
  targetId?: string;
}

export const auditRepository = {
  async create(payload: CreateAuditLogPayload): Promise<AuditLog> {
    const [inserted] = await db
      .insert(schema.auditLogs)
      .values({
        universityId: payload.universityId,
        actorId: payload.actorId,
        action: payload.action,
        method: payload.method,
        path: payload.path,
        status: payload.status,
        targetType: payload.targetType ?? null,
        targetId: payload.targetId ?? null,
        metadata: payload.metadata ?? null,
        ip: payload.ip ?? null,
      })
      .returning();
    return inserted;
  },

  /**
   * Tenant'ın denetim akışı, en yeniden eskiye. Keyset (cursor) sayfalama —
   * gerekçe notifications.repository.listByUser ile aynı: OFFSET derin sayfada
   * yavaşlar ve araya yeni kayıt girince satır atlar/tekrarlar.
   */
  async listByUniversity(
    universityId: string,
    limit: number,
    cursor?: Date,
    filter?: ListAuditLogsFilter
  ): Promise<AuditLogListItem[]> {
    const conditions = [eq(schema.auditLogs.universityId, universityId)];
    if (cursor) conditions.push(lt(schema.auditLogs.createdAt, cursor));
    if (filter?.actorId) conditions.push(eq(schema.auditLogs.actorId, filter.actorId));
    if (filter?.action) conditions.push(eq(schema.auditLogs.action, filter.action));
    if (filter?.targetId) conditions.push(eq(schema.auditLogs.targetId, filter.targetId));

    const rows = await db
      .select({
        log: schema.auditLogs,
        actor: {
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
        },
      })
      .from(schema.auditLogs)
      // leftJoin: aktör satırı teorik olarak silinse bile kayıt akıştan düşmesin.
      .leftJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit);

    return rows.map(({ log, actor }) => ({ ...log, actor }));
  },
};
