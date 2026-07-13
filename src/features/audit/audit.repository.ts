import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { auditLogs, users } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import { AuditLog, AuditLogListItem, CreateAuditLogPayload } from "./audit.types";

export interface ListAuditLogsFilter {
  actorId?: string;
  action?: string;
  targetId?: string;
}

/**
 * Denetim (audit) veri erişimi. Append-only tek sahip tablo; yazma tarafını
 * BaseRepository'den alır. `listByUniversity` aktör satırını leftJoin ettiği için
 * özel kalır (core keyset helper'ı JOIN desteklemez — bilinçli).
 */
class AuditRepository extends BaseRepository<typeof auditLogs> {
  constructor() {
    super(db, auditLogs);
  }

  record(payload: CreateAuditLogPayload): Promise<AuditLog> {
    return this.create({
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
    });
  }

  /**
   * Tenant'ın denetim akışı, en yeniden eskiye. Keyset (cursor) sayfalama —
   * gerekçe notifications.listByUser ile aynı: OFFSET derin sayfada yavaşlar ve araya
   * yeni kayıt girince satır atlar/tekrarlar.
   */
  async listByUniversity(
    universityId: string,
    limit: number,
    cursor?: Date,
    filter?: ListAuditLogsFilter
  ): Promise<AuditLogListItem[]> {
    const conditions = [eq(auditLogs.universityId, universityId)];
    if (cursor) conditions.push(lt(auditLogs.createdAt, cursor));
    if (filter?.actorId) conditions.push(eq(auditLogs.actorId, filter.actorId));
    if (filter?.action) conditions.push(eq(auditLogs.action, filter.action));
    if (filter?.targetId) conditions.push(eq(auditLogs.targetId, filter.targetId));

    const rows = await db
      .select({
        log: auditLogs,
        actor: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(auditLogs)
      // leftJoin: aktör satırı teorik olarak silinse bile kayıt akıştan düşmesin.
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return rows.map(({ log, actor }) => ({ ...log, actor }));
  }
}

export const auditRepository = new AuditRepository();
