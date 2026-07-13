import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { requireClubStaff, ClubVariables } from "../../middlewares/club.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { createGalleryImageSchema } from "./gallery.schema";
import { galleryService } from "./gallery.service";

// Bu router, clubs.routes.ts içinde "/:clubId/gallery" olarak mount edilir;
// bu yüzden ":clubId" parametresi parent route'tan miras alınır.
export const galleryRoutes = new Hono<{ Variables: ClubVariables }>();

// Not: rotalar bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
// fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.

// 1. KULÜBÜN GALERİSİNİ LİSTELEME (herhangi bir giriş yapmış kullanıcı)
galleryRoutes.get("/", authMiddleware, async (c) => {
  const clubId = c.req.param("clubId")!;
  const images = await galleryService.listByClub(clubId);
  return ok(c, images, "gallery.listed");
});

// 2. GALERİYE GÖRSEL EKLEME (kulüp başkanı/officer)
galleryRoutes.post(
  "/",
  authMiddleware,
  requireClubStaff,
  validate("json", createGalleryImageSchema),
  async (c) => {
    const user = c.get("user");
    const clubId = c.req.param("clubId")!;
    const body = c.req.valid("json");
    const image = await galleryService.addImage(clubId, user.userId, body);
    return created(c, image, "gallery.imageAdded");
  }
);

// 3. GALERİDEN GÖRSEL SİLME (kulüp başkanı/officer)
galleryRoutes.delete("/:imageId", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const imageId = c.req.param("imageId")!;
  await galleryService.removeImage(clubId, imageId);
  return done(c, "gallery.imageRemoved");
});
