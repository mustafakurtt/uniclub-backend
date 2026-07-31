import { Hono } from "hono";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { tenantsRoutes } from "./tenants/tenants.routes";
import { operatorUsersRoutes } from "./operator-users/operator-users.routes";

/**
 * SaaS operatör (control plane) kök router — `/api/platform` altına mount edilir.
 * Alt modüller kendi path prefix'lerini taşır (tenants → `/tenants`, users → `/users`, …).
 */
export const platformRoutes = new Hono<{ Variables: RbacVariables }>();

platformRoutes.route("/", tenantsRoutes);
platformRoutes.route("/", operatorUsersRoutes);
