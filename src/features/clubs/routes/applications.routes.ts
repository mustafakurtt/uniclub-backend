import { Hono } from "hono";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { ClubVariables } from "../../../middlewares/club.middleware";
import { createApplicationSchema } from "../clubs.schema";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { validate } from "../../../shared/utils/validate";
import { ok, created, done } from "../../../shared/utils/respond";

/**
 * Kulüp KURMA başvuruları (başvuran self-service). Başvuru oluşturma, kendi
 * başvurusunu onay adımlarıyla görüntüleme ve bekleyen başvuruyu geri çekme.
 * Başvuruların DEĞERLENDİRİLMESİ (onay/red) okul yöneticisinin işidir — bkz.
 * admin routes (club.approve).
 *
 * Not: Bu rotalar "/applications" ile başlar; ":clubId" tabanlı rotalarla
 * (browse/membership) segment sayısı/literal çakışması yoktur (Hono doğru eşler).
 * Bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError fırlatır,
 * `app.onError` (core/http/error-handler) tek noktadan çevirir.
 */
export const applicationsRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. KULÜP BAŞVURUSU OLUŞTURMA
applicationsRoutes.post(
  "/applications",
  authMiddleware,
  validate("json", createApplicationSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const application = await clubsService.createApplication(requireTenant(user.universityId), user.userId, body);
    return created(c, application, "club.applicationSubmitted");
  }
);

// 2. KENDİ BAŞVURUMUN DETAYI (onay adımlarıyla)
applicationsRoutes.get("/applications/:applicationId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { applicationId } = c.req.param();
  const application = await clubsService.getMyApplication(user.userId, applicationId);
  return ok(c, application, "club.applicationFound");
});

// 3. BEKLEYEN BAŞVURUYU GERİ ÇEKME
applicationsRoutes.delete("/applications/:applicationId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { applicationId } = c.req.param();
  await clubsService.withdrawApplication(user.userId, applicationId);
  return done(c, "club.applicationWithdrawn");
});
