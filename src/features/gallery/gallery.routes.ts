import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { requireClubStaff, ClubVariables } from "../../middlewares/club.middleware";
import { createGalleryImageSchema } from "./gallery.schema";
import { galleryService } from "./gallery.service";
import { respondWithBusinessError } from "../../shared/utils/error.util";

// Bu router, clubs.routes.ts içinde "/:clubId/gallery" olarak mount edilir;
// bu yüzden ":clubId" parametresi parent route'tan miras alınır.
export const galleryRoutes = new Hono<{ Variables: ClubVariables }>();

const statusFromError = (message: string) => (message.includes("bulunamadı") ? 404 : 400);

// 1. KULÜBÜN GALERİSİNİ LİSTELEME (herhangi bir giriş yapmış kullanıcı)
galleryRoutes.get("/", authMiddleware, async (c) => {
  const clubId = c.req.param("clubId")!;
  const images = await galleryService.listByClub(clubId);
  return c.json({ success: true, message: "Galeri listelendi.", data: images });
});

// 2. GALERİYE GÖRSEL EKLEME (kulüp başkanı/officer)
galleryRoutes.post(
  "/",
  authMiddleware,
  requireClubStaff,
  zValidator("json", createGalleryImageSchema),
  async (c) => {
    const user = c.get("user");
    const clubId = c.req.param("clubId")!;
    const body = c.req.valid("json");
    const image = await galleryService.addImage(clubId, user.userId, body);
    return c.json({ success: true, message: "Görsel eklendi.", data: image }, 201);
  }
);

// 3. GALERİDEN GÖRSEL SİLME (kulüp başkanı/officer)
galleryRoutes.delete("/:imageId", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const imageId = c.req.param("imageId")!;
  try {
    await galleryService.removeImage(clubId, imageId);
    return c.json({ success: true, message: "Görsel kaldırıldı." });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});
