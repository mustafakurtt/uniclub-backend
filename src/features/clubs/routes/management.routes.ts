import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { requireClubOfficer, requireClubPresident, ClubVariables } from "../../../middlewares/club.middleware";
import {
  updateOwnClubSchema,
  createContactLinkSchema,
  updateContactLinkSchema,
} from "../clubs.schema";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { statusFromError } from "./shared";
import { respondWithBusinessError } from "../../../shared/utils/error.util";

/**
 * Kulübün kendi yönetimi: başkanın kulüp profilini düzenlemesi ve iletişim/sosyal
 * medya linkleri (officer/president). Kulübün DURUMUNU (approved/archived) buradan
 * değiştiremezsin — o okul yöneticisinin işidir (admin: club.update).
 */
export const managementRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. KENDİ KULÜBÜMÜ DÜZENLEME (yalnızca president) — ad/açıklama/logo/kapak/joinPolicy
managementRoutes.patch(
  "/:clubId",
  authMiddleware,
  requireClubPresident,
  zValidator("json", updateOwnClubSchema),
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const updated = await clubsService.updateOwnClub(requireTenant(user.universityId), clubId, body);
      return c.json({ success: true, message: "Kulüp bilgileri güncellendi.", data: updated });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 2. İLETİŞİM LİNKİ EKLEME (officer/president)
managementRoutes.post(
  "/:clubId/contact-links",
  authMiddleware,
  requireClubOfficer,
  zValidator("json", createContactLinkSchema),
  async (c) => {
    const { clubId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const link = await clubsService.addContactLink(clubId, body);
      return c.json({ success: true, message: "İletişim linki eklendi.", data: link }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 3. İLETİŞİM LİNKİNİ GÜNCELLEME (officer/president) — yalnızca URL
managementRoutes.patch(
  "/:clubId/contact-links/:linkId",
  authMiddleware,
  requireClubOfficer,
  zValidator("json", updateContactLinkSchema),
  async (c) => {
    const { clubId, linkId } = c.req.param();
    const { url } = c.req.valid("json");
    try {
      const link = await clubsService.updateContactLink(clubId, linkId, url);
      return c.json({ success: true, message: "İletişim linki güncellendi.", data: link });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 4. İLETİŞİM LİNKİ SİLME (officer/president)
managementRoutes.delete("/:clubId/contact-links/:linkId", authMiddleware, requireClubOfficer, async (c) => {
  const { clubId, linkId } = c.req.param();
  try {
    await clubsService.removeContactLink(clubId, linkId);
    return c.json({ success: true, message: "İletişim linki kaldırıldı." });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});
