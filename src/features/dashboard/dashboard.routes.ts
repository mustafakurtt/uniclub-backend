import { Hono } from "hono";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { feedQuerySchema } from "./dashboard.schema";
import { dashboardService } from "./dashboard.service";

/**
 * Öğrenci FEED'i — `/api/feed` altına mount edilir (index.ts). Giriş yapmış
 * kullanıcının ONAYLI üye olduğu kulüplerin duyuru + yayınlanmış etkinliklerini
 * zaman sırasıyla birleştirir (keyset cursor). Öğrenci ÖZETİ ayrı yerdedir:
 * `/api/users/me/dashboard` (users feature'ı, dashboardService'e delege eder).
 *
 * try/catch yok — servis HttpError fırlatır, `app.onError` tek noktadan çevirir.
 */
export const feedRoutes = new Hono<{ Variables: Variables }>();

feedRoutes.use("*", authMiddleware, requireActiveUser);

feedRoutes.get("/", validate("query", feedQuerySchema), async (c) => {
  const user = c.get("user");
  const query = c.req.valid("query");
  const feed = await dashboardService.getFeed(user.userId, query);
  return ok(c, feed, "feed.listed");
});
