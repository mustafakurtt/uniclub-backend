import { Hono } from "hono";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { requireClubStaff, ClubVariables } from "../../../middlewares/club.middleware";
import { validate } from "../../../shared/utils/validate";
import { ok, created, done } from "../../../shared/utils/respond";
import { createActivitySchema, updateActivitySchema, inviteCoHostSchema } from "../activities.schema";
import { activitiesService } from "../activities.service";

/**
 * Kulübün etkinlik YÖNETİMİ — clubs.routes.ts içinde "/:clubId/activities" olarak
 * mount edilir (":clubId" parent'tan miras). Yazma işleri HOST kulübün staff'ına
 * (danışman/officer/başkan) açıktır; listeleme her giriş yapmış kullanıcıya.
 *
 * try/catch yok — servis HttpError fırlatır, `app.onError` tek noktadan çevirir.
 */
export const clubActivitiesRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. KULÜBÜN ETKİNLİKLERİ (herhangi bir giriş yapmış kullanıcı; members görünürlüğü üyeliğe göre süzülür)
clubActivitiesRoutes.get("/", authMiddleware, async (c) => {
  const clubId = c.req.param("clubId")!;
  const user = c.get("user");
  const activities = await activitiesService.listByClub(clubId, user.userId);
  return ok(c, activities, "activity.listed");
});

// 2. ETKİNLİK OLUŞTURMA (host kulüp staff)
clubActivitiesRoutes.post(
  "/",
  authMiddleware,
  requireClubStaff,
  validate("json", createActivitySchema),
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const user = c.get("user");
    const body = c.req.valid("json");
    const activity = await activitiesService.createForClub(clubId, user.userId, body);
    return created(c, activity, "activity.created");
  }
);

// 3. ETKİNLİK GÜNCELLEME (host staff)
clubActivitiesRoutes.patch(
  "/:activityId",
  authMiddleware,
  requireClubStaff,
  validate("json", updateActivitySchema),
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const activityId = c.req.param("activityId")!;
    const body = c.req.valid("json");
    const updated = await activitiesService.updateForClub(clubId, activityId, body);
    return ok(c, updated, "activity.updated");
  }
);

// 4. TASLAK YAYINLAMA (host staff) — üyelere bildirim gider
clubActivitiesRoutes.post("/:activityId/publish", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const activityId = c.req.param("activityId")!;
  const published = await activitiesService.publishForClub(clubId, activityId);
  return ok(c, published, "activity.publishedOk");
});

// 5. ETKİNLİK İPTAL (host staff) — katılımcılara bildirim gider
clubActivitiesRoutes.post("/:activityId/cancel", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const activityId = c.req.param("activityId")!;
  const cancelled = await activitiesService.cancelForClub(clubId, activityId);
  return ok(c, cancelled, "activity.cancelledOk");
});

// 6. KATILIMCI LİSTESİ (host staff)
clubActivitiesRoutes.get("/:activityId/attendees", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const activityId = c.req.param("activityId")!;
  const attendees = await activitiesService.listAttendeesForClub(clubId, activityId);
  return ok(c, attendees, "attendee.listed");
});

// 7. YOKLAMA / CHECK-IN (host staff) — katılımcıyı "geldi" işaretle / geri al
clubActivitiesRoutes.post(
  "/:activityId/attendees/:userId/check-in",
  authMiddleware,
  requireClubStaff,
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const activityId = c.req.param("activityId")!;
    const userId = c.req.param("userId")!;
    const attendee = await activitiesService.setCheckIn(clubId, activityId, userId, true);
    return ok(c, attendee, "attendee.checkedIn");
  }
);

clubActivitiesRoutes.delete(
  "/:activityId/attendees/:userId/check-in",
  authMiddleware,
  requireClubStaff,
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const activityId = c.req.param("activityId")!;
    const userId = c.req.param("userId")!;
    const attendee = await activitiesService.setCheckIn(clubId, activityId, userId, false);
    return ok(c, attendee, "attendee.checkInUndone");
  }
);

// ── Co-host davet/kabul ─────────────────────────────────────────────────────
// NOT: yol param'ı ":clubId" işlemi YAPAN kulüptür. Davet/liste/kaldırma'da
// HOST kulüp (servis host doğrular); kabul/ayrılmada CO-HOST kulüp (servis bağı
// doğrular). requireClubStaff daima o kulübün staff'ını yetkilendirir.

// 8. CO-HOST DAVET ET (host staff) — hedef kulüp aynı ya da farklı üniversiteden olabilir
clubActivitiesRoutes.post(
  "/:activityId/co-hosts",
  authMiddleware,
  requireClubStaff,
  validate("json", inviteCoHostSchema),
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const activityId = c.req.param("activityId")!;
    const body = c.req.valid("json");
    const invite = await activitiesService.inviteCoHost(clubId, activityId, body.clubId);
    return created(c, invite, "activity.coHostInvitedOk");
  }
);

// 9. CO-HOST LİSTESİ (host staff) — davet bekleyen + kabul eden
clubActivitiesRoutes.get("/:activityId/co-hosts", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const activityId = c.req.param("activityId")!;
  const coHosts = await activitiesService.listCoHosts(clubId, activityId);
  return ok(c, coHosts, "activity.coHostsListed");
});

// 10. CO-HOST KALDIR (host staff kaldırır)
clubActivitiesRoutes.delete(
  "/:activityId/co-hosts/:coClubId",
  authMiddleware,
  requireClubStaff,
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const activityId = c.req.param("activityId")!;
    const coClubId = c.req.param("coClubId")!;
    await activitiesService.removeCoHost(clubId, activityId, coClubId);
    return done(c, "activity.coHostRemoved");
  }
);

// 11. CO-HOST DAVETİ KABUL ET (davet edilen kulübün staff'ı; ":clubId" = co-host kulüp)
clubActivitiesRoutes.post("/:activityId/co-host/accept", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const activityId = c.req.param("activityId")!;
  const accepted = await activitiesService.acceptCoHostInvite(clubId, activityId);
  return ok(c, accepted, "activity.coHostAccepted");
});

// 12. CO-HOST DAVETİNİ REDDET / ORTAKLIKTAN AYRIL (co-host kulübün staff'ı)
clubActivitiesRoutes.delete("/:activityId/co-host", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const activityId = c.req.param("activityId")!;
  await activitiesService.leaveCoHost(clubId, activityId);
  return done(c, "activity.coHostRemoved");
});
