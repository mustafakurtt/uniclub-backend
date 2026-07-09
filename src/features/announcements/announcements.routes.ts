import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { requireClubStaff, ClubVariables } from "../../middlewares/club.middleware";
import { createAnnouncementSchema } from "./announcements.schema";
import { announcementsService } from "./announcements.service";
import { requireTenant } from "../../shared/utils/tenant.util";
import { respondWithBusinessError } from "../../shared/utils/error.util";

// Bu router, clubs.routes.ts içinde "/:clubId/announcements" olarak mount edilir;
// bu yüzden ":clubId" parametresi parent route'tan miras alınır.
export const announcementsRoutes = new Hono<{ Variables: ClubVariables }>();

const statusFromError = (message: string) => (message.includes("bulunamadı") ? 404 : 400);

// 1. KULÜBÜN DUYURULARINI LİSTELEME (herhangi bir giriş yapmış kullanıcı)
announcementsRoutes.get("/", authMiddleware, async (c) => {
  const clubId = c.req.param("clubId")!;
  const announcements = await announcementsService.listByClub(clubId);
  return c.json({ success: true, message: "Duyurular listelendi.", data: announcements });
});

// 2. DUYURU OLUŞTURMA (kulüp başkanı/officer)
announcementsRoutes.post(
  "/",
  authMiddleware,
  requireClubStaff,
  zValidator("json", createAnnouncementSchema),
  async (c) => {
    const user = c.get("user");
    const clubId = c.req.param("clubId")!;
    const body = c.req.valid("json");
    const announcement = await announcementsService.create(requireTenant(user.universityId), clubId, user.userId, body);
    return c.json({ success: true, message: "Duyuru oluşturuldu.", data: announcement }, 201);
  }
);

// 3. DUYURU SİLME (kulüp başkanı/officer)
announcementsRoutes.delete("/:announcementId", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const announcementId = c.req.param("announcementId")!;
  try {
    await announcementsService.remove(clubId, announcementId);
    return c.json({ success: true, message: "Duyuru silindi." });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});
