import { Hono } from "hono";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import {
  requireClubStaff,
  requireClubOfficer,
  requireClubPresident,
  ClubVariables,
} from "../../../middlewares/club.middleware";
import {
  decideJoinRequestSchema,
  updateMemberRoleSchema,
  transferPresidencySchema,
} from "../clubs.schema";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { validate } from "../../../shared/utils/validate";
import { ok, done } from "../../../shared/utils/respond";

/**
 * Kulüp-içi üyelik yönetimi (kulüp bazlı rol katmanı). Yetki, global RBAC'tan
 * değil kulüpteki rolden gelir:
 *  - Bekleyen istekleri GÖRÜNTÜLEME → danışman veya officer/president (staff)
 *  - Karar/çıkarma → officer/president
 *  - Rol değişimi / başkanlık devri → yalnızca president
 *
 * Bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError fırlatır,
 * `app.onError` (core/http/error-handler) tek noktadan çevirir.
 */
export const membershipRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. BEKLEYEN ÜYELİK İSTEKLERİNİ LİSTELEME (staff: danışman/officer/president)
membershipRoutes.get("/:clubId/join-requests", authMiddleware, requireClubStaff, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  const requests = await clubsService.listJoinRequests(requireTenant(user.universityId), clubId);
  return ok(c, requests, "club.joinRequestsListed");
});

// 2. ÜYELİK İSTEĞİNİ ONAYLAMA/REDDETME (officer/president)
membershipRoutes.patch(
  "/:clubId/join-requests/:userId",
  authMiddleware,
  requireClubOfficer,
  validate("json", decideJoinRequestSchema),
  async (c) => {
    const { clubId, userId } = c.req.param();
    const { decision } = c.req.valid("json");
    const updated = await clubsService.decideJoinRequest(clubId, userId, decision);
    return ok(c, updated, "club.joinRequestDecided");
  }
);

// 3. ÜYE ÇIKARMA (officer/president)
membershipRoutes.delete("/:clubId/members/:userId", authMiddleware, requireClubOfficer, async (c) => {
  const { clubId, userId } = c.req.param();
  await clubsService.removeMember(clubId, userId);
  return done(c, "club.memberRemoved");
});

// 4. ÜYE ROLÜNÜ GÜNCELLEME — member↔officer (yalnızca president)
membershipRoutes.patch(
  "/:clubId/members/:userId/role",
  authMiddleware,
  requireClubPresident,
  validate("json", updateMemberRoleSchema),
  async (c) => {
    const { clubId, userId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await clubsService.updateMemberRole(clubId, userId, body);
    return ok(c, updated, "club.memberRoleUpdated");
  }
);

// 5. BAŞKANLIK DEVRİ (yalnızca mevcut president) — eski başkan officer'a düşer
membershipRoutes.post(
  "/:clubId/transfer-presidency",
  authMiddleware,
  requireClubPresident,
  validate("json", transferPresidencySchema),
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const { newPresidentId } = c.req.valid("json");
    const newPresident = await clubsService.transferPresidency(clubId, user.userId, newPresidentId);
    return ok(c, newPresident, "club.presidencyTransferred");
  }
);
