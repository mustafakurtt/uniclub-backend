import { Hono } from "hono";
import { publicReadIpLimit } from "../../middlewares/rate-limit.middleware";
import { ok } from "../../shared/utils/respond";
import { publicService } from "./public.service";

/**
 * Kamuya açık okuma yüzeyi (T10.3/T10.5) — kimlik doğrulama yok.
 * Tenant sınırı URL'deki universitySlug ile; gizli kaynaklar 404.
 */
export const publicRoutes = new Hono();

publicRoutes.use("*", publicReadIpLimit);

publicRoutes.get("/universities/:universitySlug/clubs/:clubSlug", async (c) => {
  const { universitySlug, clubSlug } = c.req.param();
  const page = await publicService.getClubPage(universitySlug, clubSlug);
  return ok(c, page, "public.clubFound");
});

publicRoutes.get("/universities/:universitySlug/activities/:activityId", async (c) => {
  const { universitySlug, activityId } = c.req.param();
  const activity = await publicService.getActivity(universitySlug, activityId);
  return ok(c, activity, "public.activityFound");
});
