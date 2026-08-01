import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { requireClubStaff, ClubVariables } from "../../middlewares/club.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { requireTenant } from "../../shared/utils/tenant.util";
import { createPosterQrSchema, updatePosterQrSchema } from "./poster-qr.schema";
import { posterQrService } from "./poster-qr.service";

/**
 * Kulüp kapsamı afiş QR yönetimi — clubs.routes.ts içinde `/:clubId/poster-qr` olarak mount.
 */
export const clubPosterQrRoutes = new Hono<{ Variables: ClubVariables }>();

clubPosterQrRoutes.get("/", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const list = await posterQrService.listForClub(clubId);
  return ok(c, list, "posterQr.listed");
});

clubPosterQrRoutes.get("/analytics", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const user = c.get("user");
  const analytics = await posterQrService.getOverviewAnalyticsForClub(
    clubId,
    requireTenant(user.universityId)
  );
  return ok(c, analytics, "posterQr.analyticsReady");
});

clubPosterQrRoutes.get("/:qrId/analytics", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const qrId = c.req.param("qrId")!;
  const user = c.get("user");
  const analytics = await posterQrService.getCodeAnalyticsForClub(
    clubId,
    requireTenant(user.universityId),
    qrId
  );
  return ok(c, analytics, "posterQr.analyticsReady");
});

clubPosterQrRoutes.post(
  "/",
  authMiddleware,
  requireClubStaff,
  validate("json", createPosterQrSchema),
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const user = c.get("user");
    const body = c.req.valid("json");
    const qr = await posterQrService.createForClub(
      clubId,
      requireTenant(user.universityId),
      user.userId,
      body
    );
    return created(c, qr, "posterQr.created");
  }
);

clubPosterQrRoutes.patch(
  "/:qrId",
  authMiddleware,
  requireClubStaff,
  validate("json", updatePosterQrSchema),
  async (c) => {
    const clubId = c.req.param("clubId")!;
    const qrId = c.req.param("qrId")!;
    const user = c.get("user");
    const body = c.req.valid("json");
    const qr = await posterQrService.updateForClub(
      clubId,
      requireTenant(user.universityId),
      qrId,
      body
    );
    return ok(c, qr, "posterQr.updated");
  }
);

clubPosterQrRoutes.post("/:qrId/cancel", authMiddleware, requireClubStaff, async (c) => {
  const clubId = c.req.param("clubId")!;
  const qrId = c.req.param("qrId")!;
  const user = c.get("user");
  const qr = await posterQrService.cancelForClub(
    clubId,
    requireTenant(user.universityId),
    qrId
  );
  return ok(c, qr, "posterQr.cancelled");
});
