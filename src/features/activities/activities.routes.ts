import { Hono } from "hono";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, done } from "../../shared/utils/respond";
import { requireTenant } from "../../shared/utils/tenant.util";
import { listActivitiesQuerySchema, rsvpSchema } from "./activities.schema";
import { activitiesService } from "./activities.service";

/**
 * Etkinlik KEŞİF + RSVP yüzeyi — `/api/activities` altına mount edilir (index.ts).
 * Tenant path param'ıyla değil, JWT'deki universityId ile kapsanır (kulüp
 * rotalarıyla aynı desen). Etkinlik oluşturma/yönetimi burada DEĞİL, kulüp
 * alt-kaynağındadır (routes/club-activities.routes.ts → /api/clubs/:clubId/activities).
 *
 * try/catch yok — servis HttpError fırlatır, `app.onError` tek noktadan çevirir.
 */
export const activitiesRoutes = new Hono<{ Variables: Variables }>();

// Tüm rotalar giriş ister; askıya alınan kullanıcı ANINDA kesilir.
activitiesRoutes.use("*", authMiddleware, requireActiveUser);

// 1. KEŞİF — üniversite geneli yayınlanmış (university görünürlüğü) etkinlikler
activitiesRoutes.get("/", validate("query", listActivitiesQuerySchema), async (c) => {
  const user = c.get("user");
  const query = c.req.valid("query");
  const data = await activitiesService.listDiscovery(requireTenant(user.universityId), query);
  return ok(c, data, "activity.listed");
});

// 2. ETKİNLİK DETAYI (görünürlük/tenant/yayın kuralları uygulanır)
activitiesRoutes.get("/:activityId", async (c) => {
  const user = c.get("user");
  const activityId = c.req.param("activityId")!;
  const data = await activitiesService.getDetail(user.userId, requireTenant(user.universityId), activityId);
  return ok(c, data, "activity.found");
});

// 3. KATILIM BİLDİRME (RSVP: going/interested) — kapasite kontrollü
activitiesRoutes.post("/:activityId/rsvp", validate("json", rsvpSchema), async (c) => {
  const user = c.get("user");
  const activityId = c.req.param("activityId")!;
  const body = c.req.valid("json");
  const data = await activitiesService.rsvp(user.userId, requireTenant(user.universityId), activityId, body);
  return ok(c, data, "attendee.rsvpSaved");
});

// 4. KATILIMI GERİ ALMA (idempotent)
activitiesRoutes.delete("/:activityId/rsvp", async (c) => {
  const user = c.get("user");
  const activityId = c.req.param("activityId")!;
  await activitiesService.cancelRsvp(user.userId, activityId);
  return done(c, "attendee.rsvpRemoved");
});
