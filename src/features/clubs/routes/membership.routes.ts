import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
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
import { statusFromError } from "./shared";
import { respondWithBusinessError } from "../../../shared/utils/error.util";

/**
 * Kulüp-içi üyelik yönetimi (kulüp bazlı rol katmanı). Yetki, global RBAC'tan
 * değil kulüpteki rolden gelir:
 *  - Bekleyen istekleri GÖRÜNTÜLEME → danışman veya officer/president (staff)
 *  - Karar/çıkarma → officer/president
 *  - Rol değişimi / başkanlık devri → yalnızca president
 */
export const membershipRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. BEKLEYEN ÜYELİK İSTEKLERİNİ LİSTELEME (staff: danışman/officer/president)
membershipRoutes.get("/:clubId/join-requests", authMiddleware, requireClubStaff, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  try {
    const requests = await clubsService.listJoinRequests(requireTenant(user.universityId), clubId);
    return c.json({ success: true, message: "Bekleyen istekler listelendi.", data: requests });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 2. ÜYELİK İSTEĞİNİ ONAYLAMA/REDDETME (officer/president)
membershipRoutes.patch(
  "/:clubId/join-requests/:userId",
  authMiddleware,
  requireClubOfficer,
  zValidator("json", decideJoinRequestSchema),
  async (c) => {
    const { clubId, userId } = c.req.param();
    const { decision } = c.req.valid("json");
    try {
      const updated = await clubsService.decideJoinRequest(clubId, userId, decision);
      return c.json({ success: true, message: "Üyelik isteği güncellendi.", data: updated });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 3. ÜYE ÇIKARMA (officer/president)
membershipRoutes.delete("/:clubId/members/:userId", authMiddleware, requireClubOfficer, async (c) => {
  const { clubId, userId } = c.req.param();
  try {
    await clubsService.removeMember(clubId, userId);
    return c.json({ success: true, message: "Üye kulüpten çıkarıldı." });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 4. ÜYE ROLÜNÜ GÜNCELLEME — member↔officer (yalnızca president)
membershipRoutes.patch(
  "/:clubId/members/:userId/role",
  authMiddleware,
  requireClubPresident,
  zValidator("json", updateMemberRoleSchema),
  async (c) => {
    const { clubId, userId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const updated = await clubsService.updateMemberRole(clubId, userId, body);
      return c.json({ success: true, message: "Üye rolü güncellendi.", data: updated });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 5. BAŞKANLIK DEVRİ (yalnızca mevcut president) — eski başkan officer'a düşer
membershipRoutes.post(
  "/:clubId/transfer-presidency",
  authMiddleware,
  requireClubPresident,
  zValidator("json", transferPresidencySchema),
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const { newPresidentId } = c.req.valid("json");
    try {
      const newPresident = await clubsService.transferPresidency(clubId, user.userId, newPresidentId);
      return c.json({ success: true, message: "Başkanlık devredildi.", data: newPresident });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);
