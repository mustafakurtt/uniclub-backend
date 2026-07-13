import { Hono } from "hono";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { ClubVariables } from "../../../middlewares/club.middleware";
import { listClubsQuerySchema } from "../clubs.schema";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { validate } from "../../../shared/utils/validate";
import { ok, created, done } from "../../../shared/utils/respond";

/**
 * Keşif / okuma + üyelik (herhangi bir giriş yapmış kullanıcı). Kulüpleri
 * listeleme/görüntüleme, üye listesi, katılma/ayrılma. Tüm rotalar kendi
 * üniversitesi (JWT'deki universityId) ile sınırlıdır.
 *
 * Bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError fırlatır,
 * `app.onError` (core/http/error-handler) tek noktadan çevirir.
 */
export const browseRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. ÜNİVERSİTEMDEKİ ONAYLI KULÜPLERİ LİSTELEME (opsiyonel ?search=)
browseRoutes.get("/", authMiddleware, validate("query", listClubsQuerySchema), async (c) => {
  const user = c.get("user");
  const { search } = c.req.valid("query");
  const clubs = await clubsService.listClubs(requireTenant(user.universityId), search);
  return ok(c, clubs, "club.listed");
});

// 2. TEK BİR KULÜBÜN DETAYI (danışmanlar, onaylı üyeler, iletişim linkleri)
browseRoutes.get("/:clubId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  const club = await clubsService.getClubDetail(requireTenant(user.universityId), clubId);
  return ok(c, club, "club.found");
});

// 3. KULÜBÜN ONAYLI ÜYELERİNİ LİSTELEME (rolleriyle)
browseRoutes.get("/:clubId/members", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  const members = await clubsService.listMembers(requireTenant(user.universityId), clubId);
  return ok(c, members, "club.membersListed");
});

// 4. KULÜBE ÜYE OLMA (joinPolicy'ye göre otomatik onay ya da bekleyen istek)
browseRoutes.post("/:clubId/join", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  const membership = await clubsService.joinClub(requireTenant(user.universityId), clubId, user.userId);
  return created(c, membership, "club.joinProcessed");
});

// 5. KULÜPTEN AYRILMA
browseRoutes.delete("/:clubId/leave", authMiddleware, async (c) => {
  const user = c.get("user");
  const { clubId } = c.req.param();
  await clubsService.leaveClub(requireTenant(user.universityId), clubId, user.userId);
  return done(c, "club.left");
});
