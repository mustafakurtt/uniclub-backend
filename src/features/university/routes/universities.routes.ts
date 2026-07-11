import { Hono } from "hono";
import { validate } from "../../../shared/utils/validate";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { ok, created, done } from "../../../core/http/respond";
import { UniversityPermission } from "../university.permissions";
import {
  listUniversitiesQuerySchema,
  createUniversitySchema,
  updateUniversitySchema,
} from "../university.schema";
import { universityService } from "../university.service";

/**
 * Üniversite (tenant) kaynağının kendisine ait rotalar.
 *
 * GET rotaları PUBLIC'tir (kayıt formunda üniversite seçimi için). Yazma
 * rotaları granüler university.* izinleriyle korunur. Oluşturma dışındaki
 * yazma rotaları `:universityId` taşıdığı için tenantScoped'tır — super_admin
 * bu kontrolü bypass eder, diğer roller yalnızca kendi üniversitelerini hedefler.
 *
 * Not: rotalar bilinçli olarak try/catch İÇERMEZ. Servis katmanı `HttpError`
 * (veya düz iş hatası) fırlatır; bunları `app.onError` (core/http/error-handler)
 * tek noktadan status + gövdeye çevirir. Başarılı cevaplar da core zarf
 * yardımcıları (`ok`/`created`/`done`) ile üretilir. Rotada yalnızca iş akışı görünür.
 */
export const universitiesRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. ÜNİVERSİTE OLUŞTURMA (domainleriyle birlikte)
// Not: Henüz tenant olmadığı için bu rota tenantScoped DEĞİLDİR (path'te :universityId yok).
universitiesRoutes.post(
  "/",
  ...guard(UniversityPermission.CREATE),
  validate("json", createUniversitySchema),
  async (c) => {
    const body = c.req.valid("json");
    const result = await universityService.createUniversity(body);
    return created(c, result, "Üniversite oluşturuldu.");
  }
);

// 2. ÜNİVERSİTELERİ LİSTELEME (public)
universitiesRoutes.get(
  "/",
  validate("query", listUniversitiesQuerySchema),
  async (c) => {
    const { search } = c.req.valid("query");
    const universities = await universityService.listUniversities(search);
    return ok(c, universities, "Üniversiteler listelendi.");
  }
);

// 3. TEK BİR ÜNİVERSİTEYİ GETİRME (domainleriyle birlikte, public)
universitiesRoutes.get("/:universityId", async (c) => {
  const { universityId } = c.req.param();
  const university = await universityService.getUniversity(universityId);
  return ok(c, university, "Üniversite bulundu.");
});

// 4. ÜNİVERSİTE BİLGİLERİNİ GÜNCELLEME
universitiesRoutes.patch(
  "/:universityId",
  ...guard(UniversityPermission.UPDATE, { tenantScoped: true }),
  validate("json", updateUniversitySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    const university = await universityService.updateUniversity(universityId, body);
    return ok(c, university, "Üniversite güncellendi.");
  }
);

// 5. ÜNİVERSİTE SİLME (bağlı fakülte/kullanıcı/kulüp yoksa)
universitiesRoutes.delete(
  "/:universityId",
  ...guard(UniversityPermission.DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId } = c.req.param();
    await universityService.deleteUniversity(universityId);
    return done(c, "Üniversite silindi.");
  }
);
