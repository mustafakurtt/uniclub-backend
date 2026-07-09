import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { ClubVariables } from "../../../middlewares/club.middleware";
import { createApplicationSchema } from "../clubs.schema";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { statusFromError } from "./shared";
import { respondWithBusinessError } from "../../../shared/utils/error.util";

/**
 * Kulüp KURMA başvuruları (başvuran self-service). Başvuru oluşturma, kendi
 * başvurusunu onay adımlarıyla görüntüleme ve bekleyen başvuruyu geri çekme.
 * Başvuruların DEĞERLENDİRİLMESİ (onay/red) okul yöneticisinin işidir — bkz.
 * admin routes (club.approve).
 *
 * Not: Bu rotalar "/applications" ile başlar; ":clubId" tabanlı rotalarla
 * (browse/membership) segment sayısı/literal çakışması yoktur (Hono doğru eşler).
 */
export const applicationsRoutes = new Hono<{ Variables: ClubVariables }>();

// 1. KULÜP BAŞVURUSU OLUŞTURMA
applicationsRoutes.post(
  "/applications",
  authMiddleware,
  zValidator("json", createApplicationSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    try {
      const application = await clubsService.createApplication(requireTenant(user.universityId), user.userId, body);
      return c.json({ success: true, message: "Kulüp başvurunuz alındı.", data: application }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 2. KENDİ BAŞVURUMUN DETAYI (onay adımlarıyla)
applicationsRoutes.get("/applications/:applicationId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { applicationId } = c.req.param();
  try {
    const application = await clubsService.getMyApplication(user.userId, applicationId);
    return c.json({ success: true, message: "Başvuru bulundu.", data: application });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 3. BEKLEYEN BAŞVURUYU GERİ ÇEKME
applicationsRoutes.delete("/applications/:applicationId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { applicationId } = c.req.param();
  try {
    await clubsService.withdrawApplication(user.userId, applicationId);
    return c.json({ success: true, message: "Başvurunuz geri çekildi." });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});
