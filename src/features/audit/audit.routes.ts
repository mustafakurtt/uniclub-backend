import { Hono } from "hono";
import { validate } from "../../shared/utils/validate";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { ok } from "../../shared/utils/respond";
import { AuditPermission } from "./audit.permissions";
import { listAuditLogsQuerySchema } from "./audit.schema";
import { auditService } from "./audit.service";

export const auditRoutes = new Hono<{ Variables: RbacVariables }>();

/**
 * Denetim kayıtları — SALT-OKUNUR. Yazma/silme endpoint'i bilinçli olarak yok:
 * kayıtlar guard() zincirindeki auditTrail tarafından otomatik üretilir ve
 * append-only'dir (denetim izinin bütünlüğü, düzenlenebilirliğinden değerlidir).
 *
 * GET /api/audit/universities/:universityId
 *   ?limit=50&cursor=<ISO>&actorId=<uuid>&action=user.manage&targetId=<id>
 *
 * Not: rota bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
 * fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.
 */
auditRoutes.get(
  "/universities/:universityId",
  ...guard(AuditPermission.VIEW, { tenantScoped: true }),
  validate("query", listAuditLogsQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { limit, cursor, actorId, action, targetId } = c.req.valid("query");
    const result = await auditService.list(universityId, limit, cursor, { actorId, action, targetId });
    return ok(c, result, "audit.listed");
  }
);
