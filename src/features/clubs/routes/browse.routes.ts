import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { ClubVariables } from "../../../middlewares/club.middleware";
import { listClubsQuerySchema } from "../clubs.schema";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { statusFromError } from "./shared";
import { respondWithBusinessError } from "../../../shared/utils/error.util";

/**
 * Keşif / okuma + üyelik (herhangi bir giriş yapmış kullanıcı). Kulüpleri
 * listeleme/görüntüleme, üye listesi, katılma/ayrılma. Tüm rotalar kendi
 * üniversitesi (JWT'deki universityId) ile sınırlıdır.
 */
export const browseRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. ÜNİVERSİTEMDEKİ ONAYLI KULÜPLERİ LİSTELEME (opsiyonel ?search=)
browseRoutes.get("/", authMiddleware, zValidator("query", listClubsQuerySchema), async (c) => {
  const user = c.get("user");
  const { search } = c.req.valid("query");
  const clubs = await clubsService.listClubs(requireTenant(user.universityId), search);
  return c.json({ success: true, message: "Kulüpler listelendi.", data: clubs });
});

// 2. TEK BİR KULÜBÜN DETAYI (danışmanlar, onaylı üyeler, iletişim linkleri)
browseRoutes.get("/:clubId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  try {
    const club = await clubsService.getClubDetail(requireTenant(user.universityId), clubId);
    return c.json({ success: true, message: "Kulüp bulundu.", data: club });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 3. KULÜBÜN ONAYLI ÜYELERİNİ LİSTELEME (rolleriyle)
browseRoutes.get("/:clubId/members", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  try {
    const members = await clubsService.listMembers(requireTenant(user.universityId), clubId);
    return c.json({ success: true, message: "Üyeler listelendi.", data: members });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 4. KULÜBE ÜYE OLMA (joinPolicy'ye göre otomatik onay ya da bekleyen istek)
browseRoutes.post("/:clubId/join", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  try {
    const membership = await clubsService.joinClub(requireTenant(user.universityId), clubId, user.userId);
    return c.json({ success: true, message: "Kulübe katılma isteğiniz işlendi.", data: membership }, 201);
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 5. KULÜPTEN AYRILMA
browseRoutes.delete("/:clubId/leave", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  try {
    await clubsService.leaveClub(requireTenant(user.universityId), clubId, user.userId);
    return c.json({ success: true, message: "Kulüpten ayrıldınız." });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});
