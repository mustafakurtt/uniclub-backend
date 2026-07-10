import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { AuditPermission } from "./audit.permissions";
import { listAuditLogsQuerySchema } from "./audit.schema";
import { auditService } from "./audit.service";
import { respondWithBusinessError } from "../../shared/utils/error.util";

export const auditRoutes = new Hono<{ Variables: RbacVariables }>();

/**
 * Denetim kayıtları — SALT-OKUNUR. Yazma/silme endpoint'i bilinçli olarak yok:
 * kayıtlar guard() zincirindeki auditTrail tarafından otomatik üretilir ve
 * append-only'dir (denetim izinin bütünlüğü, düzenlenebilirliğinden değerlidir).
 *
 * GET /api/audit/universities/:universityId
 *   ?limit=50&cursor=<ISO>&actorId=<uuid>&action=user.manage&targetId=<id>
 */
auditRoutes.get(
  "/universities/:universityId",
  ...guard(AuditPermission.VIEW, { tenantScoped: true }),
  zValidator("query", listAuditLogsQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { limit, cursor, actorId, action, targetId } = c.req.valid("query");
    try {
      const result = await auditService.list(universityId, limit, cursor, { actorId, action, targetId });
      return c.json({ success: true, message: "Denetim kayıtları listelendi.", data: result });
    } catch (error) {
      return respondWithBusinessError(c, error);
    }
  }
);
