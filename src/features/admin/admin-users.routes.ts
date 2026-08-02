import { Hono } from "hono";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { AdminPermission } from "./admin.permissions";
import { listUsersQuerySchema, updateUserDepartmentSchema } from "./admin-users.schema";
import { adminUsersService } from "./admin-users.service";

export const adminUsersRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. ÜNİVERSİTEDEKİ KULLANICILARI LİSTELEME (salt-okunur → user.view)
adminUsersRoutes.get(
  "/universities/:universityId/users",
  ...guard(AdminPermission.USER_VIEW, { tenantScoped: true }),
  validate("query", listUsersQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { status, role } = c.req.valid("query");
    const users = await adminUsersService.listUsers(universityId, status, role);
    return ok(c, users, "admin.usersListed");
  }
);

// 2. TEK BİR KULLANICIYI GETİRME (roller + kulüp üyelikleri + effective yetkiler)
adminUsersRoutes.get(
  "/universities/:universityId/users/:userId",
  ...guard(AdminPermission.USER_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const user = await adminUsersService.getUser(universityId, userId);
    return ok(c, user, "admin.userFound");
  }
);

// 2B. KULLANICININ EFFECTIVE (ETKİN) YETKİLERİ
adminUsersRoutes.get(
  "/universities/:universityId/users/:userId/effective-permissions",
  ...guard(AdminPermission.USER_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const data = await adminUsersService.getUserEffectivePermissions(universityId, userId);
    return ok(c, data, "admin.userEffectivePermissionsListed");
  }
);

// Not: Kullanıcı durumu (ban/unban) yönetimi ARTIK moderation feature'ına aittir
// (POST /api/moderation/.../users/:userId/ban|unban) — sebep + geçmiş + şifre
// sıfırlamayla birlikte. Eski PATCH .../status endpoint'i kaldırıldı.

// 3B. KULLANICININ BÖLÜMÜNÜ GÜNCELLEME
adminUsersRoutes.patch(
  "/universities/:universityId/users/:userId/department",
  ...guard(AdminPermission.USER_MANAGE, { tenantScoped: true }),
  validate("json", updateUserDepartmentSchema),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await adminUsersService.updateUserDepartment(universityId, userId, body);
    return ok(c, updated, "admin.userDepartmentUpdated");
  }
);
