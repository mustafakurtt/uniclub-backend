import { InferSelectModel } from "drizzle-orm";
import { auditLogs } from "../../db/schema";

export type AuditLog = InferSelectModel<typeof auditLogs>;

/** Bir denetim kaydı yaratmak için gereken yük — auditTrail sink'i üretir. */
export interface CreateAuditLogPayload {
  universityId: string | null;
  actorId: string;
  action: string;
  method: string;
  path: string;
  status: number;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Liste yanıtındaki satır: kayıt + aktörün kimlik bilgisi (frontend "kim yaptı" gösterir). */
export interface AuditLogListItem extends AuditLog {
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}
