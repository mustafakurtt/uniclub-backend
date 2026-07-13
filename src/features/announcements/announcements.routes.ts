import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { requireClubStaff, ClubVariables } from "../../middlewares/club.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { createAnnouncementSchema } from "./announcements.schema";
import { announcementsService } from "./announcements.service";
import { requireTenant } from "../../shared/utils/tenant.util";

// Bu router, clubs.routes.ts içinde "/:clubId/announcements" olarak mount edilir;
// bu yüzden ":clubId" parametresi parent route'tan miras alınır.
export const announcementsRoutes = new Hono<{ Variables: ClubVariables }>();

// Not: rotalar bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
// fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.

// 1. KULÜBÜN DUYURULARINI LİSTELEME (herhangi bir giriş yapmış kullanıcı)
announcementsRoutes.get("/", authMiddleware, async (c) => {
  const clubId = c.req.param("clubId")!;
  const announcements = await announcementsService.listByClub(clubId);
  return ok(c, announcements, "announcement.listed");
});

// 2. DUYURU OLUŞTURMA (kulüp başkanı/officer)
announcementsRoutes.post(
  "/",
  authMiddleware,
  requireClubStaff,
  validate("json", createAnnouncementSchema),
  async (c) => {
    const user = c.get("user");
    const clubId = c.req.param("clubId")!;
    const body = c.req.valid("json");
    const announcement = await announcementsService.create(requireTenant(user.universityId), clubId, user.userId, body);
    return created(c, announcement, "announcement.created");
  }
);

// 3. DUYURU SİLME (kulüp başkanı/officer)
announcementsRoutes.delete("/:announcementId", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const announcementId = c.req.param("announcementId")!;
  await announcementsService.remove(clubId, announcementId);
  return done(c, "announcement.deleted");
});
