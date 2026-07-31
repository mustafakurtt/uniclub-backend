import { Hono } from "hono";
import { guard } from "../../../core/rbac/guard";
import { invalidates } from "../../../core/cache";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { validate } from "../../../shared/utils/validate";
import { ok, created } from "../../../shared/utils/respond";
import { forbidden } from "../../../shared/utils/errors";
import { UniversityPermission } from "../../university/university.permissions";
import { universityEffects } from "../../university/university.cache";
import { PlatformPermission } from "../platform.permissions";
import { onboardTenantSchema, provisionTenantAdminSchema, updateTenantStatusSchema } from "./tenants.schema";
import { tenantsService } from "./tenants.service";

export const tenantsRoutes = new Hono<{ Variables: RbacVariables }>();

/**
 * SaaS operatörü — tenant listesi, yaşam döngüsü ve provision.
 * Tenant-scoped DEĞİL; yetki `platform.tenant.*` anahtarlarıyla korunur.
 */
tenantsRoutes.get(
  "/tenants",
  ...guard(PlatformPermission.TENANT_VIEW),
  async (c) => {
    const tenants = await tenantsService.listTenants();
    return ok(c, tenants, "platform.tenantsListed");
  }
);

tenantsRoutes.post(
  "/tenants/onboard",
  ...guard(UniversityPermission.CREATE),
  invalidates(universityEffects.universityCreated),
  validate("json", onboardTenantSchema),
  async (c, next) => {
    const body = c.req.valid("json");
    if (body.initialAdmin && !c.get("authz").permissions.includes(PlatformPermission.TENANT_INVITE)) {
      throw forbidden("platform.invitePermissionRequired");
    }
    await next();
  },
  async (c) => {
    const body = c.req.valid("json");
    const result = await tenantsService.onboardTenant(body);
    return created(c, result, "platform.tenantOnboarded");
  }
);

tenantsRoutes.post(
  "/tenants/:universityId/invite-admin",
  ...guard(PlatformPermission.TENANT_INVITE),
  validate("json", provisionTenantAdminSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    const admin = await tenantsService.inviteTenantAdmin(universityId, body);
    return created(c, admin, "platform.adminInvited");
  }
);

tenantsRoutes.patch(
  "/tenants/:universityId/status",
  ...guard(PlatformPermission.TENANT_MANAGE),
  validate("json", updateTenantStatusSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await tenantsService.updateTenantStatus(universityId, body);
    return ok(c, updated, "platform.tenantStatusUpdated");
  }
);
