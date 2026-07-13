import { Hono } from "hono";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { ModerationPermission } from "./moderation.permissions";
import { banUserSchema, activityQuerySchema } from "./moderation.schema";
import { moderationService } from "./moderation.service";

/**
 * Kullanıcı moderasyonu — tenant-scoped admin yüzeyi. Tüm rotalar :universityId
 * taşır (guard tenantScoped). try/catch yok: servis HttpError (anahtar) fırlatır,
 * app.onError tek noktadan i18n zarfına çevirir; başarılar core `ok()` ile döner.
 */
export const moderationRoutes = new Hono<{ Variables: RbacVariables }>();

const BASE = "/universities/:universityId/users/:userId";

// 1. BAN (sebepli askıya alma)
moderationRoutes.post(
  `${BASE}/ban`,
  ...guard(ModerationPermission.MODERATE, { tenantScoped: true }),
  validate("json", banUserSchema),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const body = c.req.valid("json");
    const actorId = c.get("user").userId;
    const user = await moderationService.banUser(universityId, userId, body, actorId);
    return ok(c, user, "moderation.banned");
  }
);

// 2. UNBAN (askıyı kaldırma)
moderationRoutes.post(
  `${BASE}/unban`,
  ...guard(ModerationPermission.MODERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const actorId = c.get("user").userId;
    const user = await moderationService.unbanUser(universityId, userId, actorId);
    return ok(c, user, "moderation.unbanned");
  }
);

// 3. ŞİFRE SIFIRLAMA (geçici şifre bir kez döner)
moderationRoutes.post(
  `${BASE}/reset-password`,
  ...guard(ModerationPermission.MODERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const actorId = c.get("user").userId;
    const result = await moderationService.resetPassword(universityId, userId, actorId);
    return ok(c, result, "moderation.passwordReset");
  }
);

// 4. KULLANICI AKTİVİTESİ (audit — ne yapmış)
moderationRoutes.get(
  `${BASE}/activity`,
  ...guard(ModerationPermission.VIEW, { tenantScoped: true }),
  validate("query", activityQuerySchema),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const { limit, cursor } = c.req.valid("query");
    const result = await moderationService.getUserActivity(universityId, userId, limit, cursor);
    return ok(c, result, "moderation.activityListed");
  }
);

// 5. MODERASYON GEÇMİŞİ (ban/unban/şifre sıfırlama tarihçesi)
moderationRoutes.get(
  `${BASE}/moderation-history`,
  ...guard(ModerationPermission.VIEW, { tenantScoped: true }),
  validate("query", activityQuerySchema),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const { limit, cursor } = c.req.valid("query");
    const result = await moderationService.getModerationHistory(universityId, userId, limit, cursor);
    return ok(c, result, "moderation.historyListed");
  }
);
