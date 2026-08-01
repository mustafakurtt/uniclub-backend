import { Hono } from "hono";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireClubHistoryAccess } from "../../middlewares/club-history.middleware";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { requireTenant } from "../../shared/utils/tenant.util";
import { membershipHistoryService } from "./membership-history.service";
import { listMembershipHistoryQuerySchema } from "./membership-history.schema";

export const membershipHistoryRoutes = new Hono<{ Variables: Variables }>();

membershipHistoryRoutes.get(
  "/:clubId/membership-history",
  authMiddleware,
  requireClubHistoryAccess,
  validate("query", listMembershipHistoryQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const query = c.req.valid("query");
    const result = await membershipHistoryService.listForClub(
      requireTenant(user.universityId),
      clubId,
      query
    );
    return ok(c, result, "membershipHistory.listed");
  }
);
