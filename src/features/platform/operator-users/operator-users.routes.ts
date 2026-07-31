import { Hono } from "hono";
import { guard, guardRole } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { validate } from "../../../shared/utils/validate";
import { ok, created } from "../../../shared/utils/respond";
import { PlatformPermission } from "../platform.permissions";
import { createPlatformUserSchema } from "./operator-users.schema";
import { operatorUsersService } from "./operator-users.service";

export const operatorUsersRoutes = new Hono<{ Variables: RbacVariables }>();

/**
 * Platform hesapları (`users.universityId = null`) — liste ve provision.
 * Oluşturma yalnızca `super_admin` (platform rolleri yalnızca super_admin atar).
 */
operatorUsersRoutes.get(
  "/users",
  ...guard(PlatformPermission.USER_VIEW),
  async (c) => {
    const users = await operatorUsersService.listPlatformUsers();
    return ok(c, users, "platform.usersListed");
  }
);

operatorUsersRoutes.post(
  "/users",
  ...guardRole("super_admin"),
  validate("json", createPlatformUserSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = await operatorUsersService.createPlatformUser(body);
    return created(c, user, "platform.userCreated");
  }
);
