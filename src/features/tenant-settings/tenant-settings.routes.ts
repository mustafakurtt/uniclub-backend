import { Hono } from "hono";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { TenantSettingsPermission } from "./tenant-settings.permissions";
import { tenantSettingsService } from "./tenant-settings.service";
import { patchTenantSettingsSchema } from "./tenant-settings.schema";

type RouteVariables = RbacVariables;

export const tenantSettingsRoutes = new Hono<{ Variables: RouteVariables }>();

tenantSettingsRoutes.get(
  "/:universityId/settings",
  ...guard(TenantSettingsPermission.MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId } = c.req.param();
    const settings = await tenantSettingsService.getForApi(universityId);
    return ok(c, settings, "tenantSettings.listed");
  }
);

tenantSettingsRoutes.patch(
  "/:universityId/settings",
  ...guard(TenantSettingsPermission.MANAGE, { tenantScoped: true }),
  validate("json", patchTenantSettingsSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const user = c.get("user");
    const authz = c.get("authz");
    const body = c.req.valid("json");
    const settings = await tenantSettingsService.patch(universityId, user.userId, authz, body);
    return ok(c, settings, "tenantSettings.updated");
  }
);
