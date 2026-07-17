import { Hono } from "hono";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, done } from "../../shared/utils/respond";
import { updateProfileSchema, changePasswordSchema } from "./users.schema";
import { usersService } from "./users.service";

// Bu feature tamamen self-service'tir: her rota, giriş yapmış kullanıcının
// SADECE kendi hesabı üzerinde işlem yapar (başka kullanıcıları görüntüleme/
// yönetme admin ve auth (RBAC) feature'larının işidir).
export const usersRoutes = new Hono<{ Variables: Variables }>();

// Tüm self-service rotalar giriş ister; askıya alınan kullanıcı ANINDA kesilir.
usersRoutes.use("*", authMiddleware, requireActiveUser);

// Not: rotalar bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
// fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.

// 1. KENDİ PROFİLİMİ GÖRÜNTÜLEME
usersRoutes.get("/me", async (c) => {
  const actor = c.get("user");
  const profile = await usersService.getProfile(actor.userId);
  return ok(c, profile, "user.profileFound");
});

// 2. PROFİLİMİ GÜNCELLEME
usersRoutes.patch("/me", validate("json", updateProfileSchema), async (c) => {
  const actor = c.get("user");
  const body = c.req.valid("json");
  const updated = await usersService.updateProfile(actor.userId, body);
  return ok(c, updated, "user.profileUpdated");
});

// 3. ŞİFRE DEĞİŞTİRME
usersRoutes.patch("/me/password", validate("json", changePasswordSchema), async (c) => {
  const actor = c.get("user");
  const body = c.req.valid("json");
  await usersService.changePassword(actor.userId, body);
  return done(c, "user.passwordUpdated");
});

// 3B. ETKİN (EFFECTIVE) YETKİLERİM — roller + kişisel override uygulanmış
usersRoutes.get("/me/permissions", async (c) => {
  const actor = c.get("user");
  const data = await usersService.getMyPermissions(actor.userId);
  return ok(c, data, "user.permissionsListed");
});

// 4. ÜYE OLDUĞUM KULÜPLER
usersRoutes.get("/me/clubs", async (c) => {
  const actor = c.get("user");
  const clubs = await usersService.listMyClubs(actor.userId);
  return ok(c, clubs, "user.clubMembershipsListed");
});

// 5. KULÜP BAŞVURULARIM
usersRoutes.get("/me/applications", async (c) => {
  const actor = c.get("user");
  const applications = await usersService.listMyApplications(actor.userId);
  return ok(c, applications, "user.applicationsListed");
});

// 6. DANIŞMANI OLDUĞUM KULÜPLER (advisor rolündeki personel için)
usersRoutes.get("/me/advised-clubs", async (c) => {
  const actor = c.get("user");
  const clubs = await usersService.listMyAdvisedClubs(actor.userId);
  return ok(c, clubs, "user.advisedClubsListed");
});

// 7. KATILDIĞIM ETKİNLİKLER (takvimim / RSVP'lerim)
usersRoutes.get("/me/activities", async (c) => {
  const actor = c.get("user");
  const activities = await usersService.listMyActivities(actor.userId);
  return ok(c, activities, "activity.listed");
});

// 8. PANEL ÖZETİM (kulüp/etkinlik/istek sayaçları + en yakın etkinlik)
usersRoutes.get("/me/dashboard", async (c) => {
  const actor = c.get("user");
  const summary = await usersService.getDashboard(actor.userId);
  return ok(c, summary, "dashboard.summaryLoaded");
});
