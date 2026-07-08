import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { updateProfileSchema, changePasswordSchema } from "./users.schema";
import { usersService } from "./users.service";
import { respondWithBusinessError } from "../../shared/utils/error.util";

// Bu feature tamamen self-service'tir: her rota, giriş yapmış kullanıcının
// SADECE kendi hesabı üzerinde işlem yapar (başka kullanıcıları görüntüleme/
// yönetme admin ve auth (RBAC) feature'larının işidir).
export const usersRoutes = new Hono<{ Variables: Variables }>();

// Tüm self-service rotalar giriş ister; askıya alınan kullanıcı ANINDA kesilir.
usersRoutes.use("*", authMiddleware, requireActiveUser);

const statusFromError = (message: string) => (message.includes("bulunamadı") ? 404 : 400);

// 1. KENDİ PROFİLİMİ GÖRÜNTÜLEME
usersRoutes.get("/me", authMiddleware, async (c) => {
  const actor = c.get("user");
  try {
    const profile = await usersService.getProfile(actor.userId);
    return c.json({ success: true, message: "Profil bulundu.", data: profile });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 2. PROFİLİMİ GÜNCELLEME
usersRoutes.patch(
  "/me",
  authMiddleware,
  zValidator("json", updateProfileSchema),
  async (c) => {
    const actor = c.get("user");
    const body = c.req.valid("json");
    try {
      const updated = await usersService.updateProfile(actor.userId, body);
      return c.json({ success: true, message: "Profil güncellendi.", data: updated });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 3. ŞİFRE DEĞİŞTİRME
usersRoutes.patch(
  "/me/password",
  authMiddleware,
  zValidator("json", changePasswordSchema),
  async (c) => {
    const actor = c.get("user");
    const body = c.req.valid("json");
    try {
      await usersService.changePassword(actor.userId, body);
      return c.json({ success: true, message: "Şifre güncellendi." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 3B. ETKİN (EFFECTIVE) YETKİLERİM — roller + kişisel override uygulanmış
usersRoutes.get("/me/permissions", authMiddleware, async (c) => {
  const actor = c.get("user");
  const data = await usersService.getMyPermissions(actor.userId);
  return c.json({ success: true, message: "Etkin yetkiler listelendi.", data });
});

// 4. ÜYE OLDUĞUM KULÜPLER
usersRoutes.get("/me/clubs", authMiddleware, async (c) => {
  const actor = c.get("user");
  const clubs = await usersService.listMyClubs(actor.userId);
  return c.json({ success: true, message: "Kulüp üyelikleri listelendi.", data: clubs });
});

// 5. KULÜP BAŞVURULARIM
usersRoutes.get("/me/applications", authMiddleware, async (c) => {
  const actor = c.get("user");
  const applications = await usersService.listMyApplications(actor.userId);
  return c.json({ success: true, message: "Başvurularım listelendi.", data: applications });
});

// 6. DANIŞMANI OLDUĞUM KULÜPLER (advisor rolündeki personel için)
usersRoutes.get("/me/advised-clubs", authMiddleware, async (c) => {
  const actor = c.get("user");
  const clubs = await usersService.listMyAdvisedClubs(actor.userId);
  return c.json({ success: true, message: "Danışmanı olduğunuz kulüpler listelendi.", data: clubs });
});
