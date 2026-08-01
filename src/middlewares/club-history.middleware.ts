import type { Context, Next } from "hono";
import { resolveAuthz } from "../shared/rbac/rbac.cache";
import { ClubPermission } from "../features/clubs/clubs.permissions";
import type { Variables } from "../core/auth/auth.middleware";
import type { ClubVariables } from "./club.middleware";
import { requireClubStaff } from "./club.middleware";

/**
 * Kulüp tarihçesi: kulüp personeli (danışman/officer/başkan) veya tenant
 * `club.member.manage` yetkisi (SKS moderasyon override).
 */
export async function requireClubHistoryAccess(
  c: Context<{ Variables: Variables }>,
  next: Next
) {
  const user = c.get("user");
  const authz = await resolveAuthz(user.userId);
  if (authz.permissions.includes(ClubPermission.MEMBER_MANAGE)) {
    return next();
  }
  return requireClubStaff(c as unknown as Context<{ Variables: ClubVariables }>, next);
}
