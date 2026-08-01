import { Hono } from "hono";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { createPosterQrSchema, updatePosterQrSchema } from "./poster-qr.schema";
import { PosterQrPermission } from "./poster-qr.permissions";
import { posterQrService } from "./poster-qr.service";

type RouteVariables = Variables & RbacVariables;

/**
 * Okul geneli afiş QR yönetimi — `/api/universities/:universityId/poster-qr`.
 */
export const universityPosterQrRoutes = new Hono<{ Variables: RouteVariables }>();

universityPosterQrRoutes.get(
  "/:universityId/poster-qr",
  authMiddleware,
  requireActiveUser,
  async (c) => {
    const { universityId } = c.req.param();
    const list = await posterQrService.listForUniversity(universityId);
    return ok(c, list, "posterQr.listed");
  }
);

universityPosterQrRoutes.post(
  "/:universityId/poster-qr",
  ...guard(PosterQrPermission.UNIVERSITY_MANAGE, { tenantScoped: true }),
  validate("json", createPosterQrSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const user = c.get("user");
    const body = c.req.valid("json");
    const qr = await posterQrService.createForUniversity(universityId, user.userId, body);
    return created(c, qr, "posterQr.created");
  }
);

universityPosterQrRoutes.patch(
  "/:universityId/poster-qr/:qrId",
  ...guard(PosterQrPermission.UNIVERSITY_MANAGE, { tenantScoped: true }),
  validate("json", updatePosterQrSchema),
  async (c) => {
    const { universityId, qrId } = c.req.param();
    const body = c.req.valid("json");
    const qr = await posterQrService.updateForUniversity(universityId, qrId, body);
    return ok(c, qr, "posterQr.updated");
  }
);

universityPosterQrRoutes.post(
  "/:universityId/poster-qr/:qrId/cancel",
  ...guard(PosterQrPermission.UNIVERSITY_MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId, qrId } = c.req.param();
    const qr = await posterQrService.cancelForUniversity(universityId, qrId);
    return ok(c, qr, "posterQr.cancelled");
  }
);
