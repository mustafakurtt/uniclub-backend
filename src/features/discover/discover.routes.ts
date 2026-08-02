import { Hono } from "hono";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { requireTenant } from "../../shared/utils/tenant.util";
import { TenantSettingKey } from "../tenant-settings/tenant-settings.catalog";
import { requireTenantFeatureFromAuth } from "../tenant-settings/require-feature.middleware";
import { listDiscoverActivitiesQuerySchema } from "./discover.schema";
import { discoverService } from "./discover.service";

export const discoverRoutes = new Hono<{ Variables: Variables }>();

discoverRoutes.use(
  "*",
  authMiddleware,
  requireActiveUser,
  requireTenantFeatureFromAuth(TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED)
);

discoverRoutes.get("/activities", validate("query", listDiscoverActivitiesQuerySchema), async (c) => {
  const user = c.get("user");
  const query = c.req.valid("query");
  const data = await discoverService.listActivities(requireTenant(user.universityId), query);
  return ok(c, data, "discover.activitiesListed");
});
