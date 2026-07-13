import { Hono } from "hono";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { requireClubOfficer, requireClubPresident, ClubVariables } from "../../../middlewares/club.middleware";
import {
  updateOwnClubSchema,
  createContactLinkSchema,
  updateContactLinkSchema,
} from "../clubs.schema";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { validate } from "../../../shared/utils/validate";
import { ok, created, done } from "../../../shared/utils/respond";

/**
 * Kulübün kendi yönetimi: başkanın kulüp profilini düzenlemesi ve iletişim/sosyal
 * medya linkleri (officer/president). Kulübün DURUMUNU (approved/archived) buradan
 * değiştiremezsin — o okul yöneticisinin işidir (admin: club.update).
 *
 * Bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError fırlatır,
 * `app.onError` (core/http/error-handler) tek noktadan çevirir.
 */
export const managementRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. KENDİ KULÜBÜMÜ DÜZENLEME (yalnızca president) — ad/açıklama/logo/kapak/joinPolicy
managementRoutes.patch(
  "/:clubId",
  authMiddleware,
  requireClubPresident,
  validate("json", updateOwnClubSchema),
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await clubsService.updateOwnClub(requireTenant(user.universityId), clubId, body);
    return ok(c, updated, "club.infoUpdated");
  }
);

// 2. İLETİŞİM LİNKİ EKLEME (officer/president)
managementRoutes.post(
  "/:clubId/contact-links",
  authMiddleware,
  requireClubOfficer,
  validate("json", createContactLinkSchema),
  async (c) => {
    const { clubId } = c.req.param();
    const body = c.req.valid("json");
    const link = await clubsService.addContactLink(clubId, body);
    return created(c, link, "club.contactLinkAdded");
  }
);

// 3. İLETİŞİM LİNKİNİ GÜNCELLEME (officer/president) — yalnızca URL
managementRoutes.patch(
  "/:clubId/contact-links/:linkId",
  authMiddleware,
  requireClubOfficer,
  validate("json", updateContactLinkSchema),
  async (c) => {
    const { clubId, linkId } = c.req.param();
    const { url } = c.req.valid("json");
    const link = await clubsService.updateContactLink(clubId, linkId, url);
    return ok(c, link, "club.contactLinkUpdated");
  }
);

// 4. İLETİŞİM LİNKİ SİLME (officer/president)
managementRoutes.delete("/:clubId/contact-links/:linkId", authMiddleware, requireClubOfficer, async (c) => {
  const { clubId, linkId } = c.req.param();
  await clubsService.removeContactLink(clubId, linkId);
  return done(c, "club.contactLinkRemoved");
});
