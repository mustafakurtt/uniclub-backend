import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { UniversityPermission } from "../university.permissions";
import {
  listUniversitiesQuerySchema,
  createUniversitySchema,
  updateUniversitySchema,
} from "../university.schema";
import { universityService } from "../university.service";
import { respondWithBusinessError } from "../../../shared/utils/error.util";

/**
 * Üniversite (tenant) kaynağının kendisine ait rotalar.
 *
 * GET rotaları PUBLIC'tir (kayıt formunda üniversite seçimi için). Yazma
 * rotaları granüler university.* izinleriyle korunur. Oluşturma dışındaki
 * yazma rotaları `:universityId` taşıdığı için tenantScoped'tır — super_admin
 * bu kontrolü bypass eder, diğer roller yalnızca kendi üniversitelerini hedefler.
 */
export const universitiesRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. ÜNİVERSİTE OLUŞTURMA (domainleriyle birlikte)
// Not: Henüz tenant olmadığı için bu rota tenantScoped DEĞİLDİR (path'te :universityId yok).
universitiesRoutes.post(
  "/",
  ...guard(UniversityPermission.CREATE),
  zValidator("json", createUniversitySchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const result = await universityService.createUniversity(body);
      return c.json({ success: true, message: "Üniversite oluşturuldu.", data: result }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error);
    }
  }
);

// 2. ÜNİVERSİTELERİ LİSTELEME (public)
universitiesRoutes.get(
  "/",
  zValidator("query", listUniversitiesQuerySchema),
  async (c) => {
    const { search } = c.req.valid("query");
    const universities = await universityService.listUniversities(search);
    return c.json({ success: true, message: "Üniversiteler listelendi.", data: universities });
  }
);

// 3. TEK BİR ÜNİVERSİTEYİ GETİRME (domainleriyle birlikte, public)
universitiesRoutes.get("/:universityId", async (c) => {
  const { universityId } = c.req.param();
  try {
    const university = await universityService.getUniversity(universityId);
    return c.json({ success: true, message: "Üniversite bulundu.", data: university });
  } catch (error) {
    return respondWithBusinessError(c, error);
  }
});

// 4. ÜNİVERSİTE BİLGİLERİNİ GÜNCELLEME
universitiesRoutes.patch(
  "/:universityId",
  ...guard(UniversityPermission.UPDATE, { tenantScoped: true }),
  zValidator("json", updateUniversitySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const university = await universityService.updateUniversity(universityId, body);
      return c.json({ success: true, message: "Üniversite güncellendi.", data: university });
    } catch (error) {
      return respondWithBusinessError(c, error);
    }
  }
);

// 5. ÜNİVERSİTE SİLME (bağlı fakülte/kullanıcı/kulüp yoksa)
universitiesRoutes.delete(
  "/:universityId",
  ...guard(UniversityPermission.DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId } = c.req.param();
    try {
      await universityService.deleteUniversity(universityId);
      return c.json({ success: true, message: "Üniversite silindi." });
    } catch (error) {
      return respondWithBusinessError(c, error);
    }
  }
);
