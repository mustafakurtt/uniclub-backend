import { Hono } from "hono";
import { authMiddleware, Variables } from "../../core/auth/auth.middleware";
import { requireActiveUser } from "../../middlewares/active-user.middleware";
import { guard } from "../../core/rbac/guard";
import { invalidates, fromParams } from "../../core/cache";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { universityAnnouncementPublishLimit } from "../../middlewares/rate-limit.middleware";
import {
  createUniversityAnnouncementSchema,
  updateUniversityAnnouncementSchema,
} from "./announcements.schema";
import { AnnouncementPermission } from "./announcements.permissions";
import { announcementsService } from "./announcements.service";
import { announcementEffects } from "./announcements.cache";

type RouteVariables = Variables & RbacVariables;

/**
 * Okul geneli duyurular — `/api/universities/:universityId/announcements`.
 * Kulüp duyuruları mevcut `/api/clubs/:clubId/announcements` mount'unda kalır.
 */
export const universityAnnouncementsRoutes = new Hono<{ Variables: RouteVariables }>();

universityAnnouncementsRoutes.get(
  "/:universityId/announcements",
  authMiddleware,
  requireActiveUser,
  async (c) => {
    const { universityId } = c.req.param();
    const user = c.get("user");
    const announcements = await announcementsService.listByUniversity(
      universityId,
      user.userId,
      user.universityId
    );
    return ok(c, announcements, "announcement.listed");
  }
);

universityAnnouncementsRoutes.post(
  "/:universityId/announcements",
  ...guard(AnnouncementPermission.UNIVERSITY_MANAGE, { tenantScoped: true }),
  universityAnnouncementPublishLimit,
  invalidates(announcementEffects.universityChanged, fromParams("universityId")),
  validate("json", createUniversityAnnouncementSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const user = c.get("user");
    const body = c.req.valid("json");
    const announcement = await announcementsService.createUniversity(
      universityId,
      user.userId,
      body
    );
    return created(c, announcement, "announcement.created");
  }
);

universityAnnouncementsRoutes.post(
  "/:universityId/announcements/:announcementId/publish",
  ...guard(AnnouncementPermission.UNIVERSITY_MANAGE, { tenantScoped: true }),
  universityAnnouncementPublishLimit,
  invalidates(announcementEffects.universityChanged, fromParams("universityId")),
  async (c) => {
    const { universityId, announcementId } = c.req.param();
    const user = c.get("user");
    const published = await announcementsService.publishUniversity(
      universityId,
      announcementId,
      user.userId
    );
    return ok(c, published, "announcement.published");
  }
);

universityAnnouncementsRoutes.patch(
  "/:universityId/announcements/:announcementId",
  ...guard(AnnouncementPermission.UNIVERSITY_MANAGE, { tenantScoped: true }),
  invalidates(announcementEffects.universityChanged, fromParams("universityId")),
  validate("json", updateUniversityAnnouncementSchema),
  async (c) => {
    const { universityId, announcementId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await announcementsService.updateUniversity(
      universityId,
      announcementId,
      body
    );
    return ok(c, updated, "announcement.updated");
  }
);

universityAnnouncementsRoutes.delete(
  "/:universityId/announcements/:announcementId",
  ...guard(AnnouncementPermission.UNIVERSITY_MANAGE, { tenantScoped: true }),
  invalidates(announcementEffects.universityChanged, fromParams("universityId")),
  async (c) => {
    const { universityId, announcementId } = c.req.param();
    await announcementsService.removeUniversity(universityId, announcementId);
    return done(c, "announcement.deleted");
  }
);
