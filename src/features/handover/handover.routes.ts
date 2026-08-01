import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import {
  requireClubOfficer,
  requireClubStaff,
  requireClubInTenant,
  ClubVariables,
} from "../../middlewares/club.middleware";
import { requireTenant } from "../../shared/utils/tenant.util";
import { validate } from "../../shared/utils/validate";
import { ok, created } from "../../shared/utils/respond";
import { handoverService } from "./handover.service";
import { createHandoverRecordSchema } from "./handover.schema";

/**
 * Dönemsel devir teslim (T1.3) — genel kurul kararına bağlı kurul görev devri.
 */
export const handoverRoutes = new Hono<{ Variables: ClubVariables }>();

handoverRoutes.get(
  "/:clubId/handover-records",
  authMiddleware,
  requireClubInTenant,
  requireClubStaff,
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const records = await handoverService.list(requireTenant(user.universityId), clubId);
    return ok(c, records, "handover.listed");
  }
);

handoverRoutes.get(
  "/:clubId/handover-records/:handoverId",
  authMiddleware,
  requireClubInTenant,
  requireClubStaff,
  async (c) => {
    const user = c.get("user");
    const { clubId, handoverId } = c.req.param();
    const record = await handoverService.getById(
      requireTenant(user.universityId),
      clubId,
      handoverId
    );
    return ok(c, record, "handover.found");
  }
);

handoverRoutes.post(
  "/:clubId/handover-records",
  authMiddleware,
  requireClubInTenant,
  requireClubOfficer,
  validate("json", createHandoverRecordSchema),
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const body = c.req.valid("json");
    const record = await handoverService.create(
      requireTenant(user.universityId),
      clubId,
      user.userId,
      body
    );
    return created(c, record, "handover.created");
  }
);
