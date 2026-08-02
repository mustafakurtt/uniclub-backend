import { Hono } from "hono";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { ActivityPermission } from "./activities.permissions";
import { activitiesService } from "./activities.service";
import { updateActivityVisibilitySchema, adminTenantActivitiesQuerySchema } from "./activities.schema";

export const adminActivitiesRoutes = new Hono<{ Variables: RbacVariables }>();

// 16B. TENANT ETKİNLİK LİSTESİ — tüm kulüpler tek akış (activity.moderate; club.view gerekmez)
adminActivitiesRoutes.get(
  "/universities/:universityId/activities",
  ...guard(ActivityPermission.MODERATE, { tenantScoped: true }),
  validate("query", adminTenantActivitiesQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const query = c.req.valid("query");
    const result = await activitiesService.listTenantActivities(universityId, query);
    return ok(c, result, "admin.activitiesListed");
  }
);

// 17. ETKİNLİK MODERASYONU — tenant'taki herhangi bir kulübün etkinliğini iptal etme
// (etkinlik M:N olduğu için :clubId taşımaz; servis etkinliğin tenant'a ait olduğunu doğrular)
adminActivitiesRoutes.post(
  "/universities/:universityId/activities/:activityId/cancel",
  ...guard(ActivityPermission.MODERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, activityId } = c.req.param();
    const cancelled = await activitiesService.moderateCancel(universityId, activityId);
    return ok(c, cancelled, "activity.cancelledOk");
  }
);

// 18. ETKİNLİK GÖRÜNÜRLÜĞÜ — SKS moderasyonu (inter_university dahil)
adminActivitiesRoutes.patch(
  "/universities/:universityId/clubs/:clubId/activities/:activityId",
  ...guard(ActivityPermission.MODERATE, { tenantScoped: true }),
  validate("json", updateActivityVisibilitySchema),
  async (c) => {
    const { universityId, clubId, activityId } = c.req.param();
    const { visibility } = c.req.valid("json");
    const updated = await activitiesService.updateVisibilityForModerator(
      universityId,
      clubId,
      activityId,
      visibility
    );
    return ok(c, updated, "activity.updated");
  }
);
