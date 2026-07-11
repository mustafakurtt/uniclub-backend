import { Hono } from "hono";
import { validate } from "../../../shared/utils/validate";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { ok, created, done } from "../../../shared/utils/respond";
import { UniversityPermission } from "../university.permissions";
import { createFacultySchema, updateFacultySchema } from "../university.schema";
import { universityService } from "../university.service";

/**
 * Üniversitenin fakülteleri (`:universityId/faculties`). Listeleme/getirme
 * PUBLIC (kayıt formu), yazma işlemleri granüler university.faculty.* izinleriyle
 * ve tenantScoped korunur.
 *
 * try/catch yok — servisin fırlattığı HttpError'ları `app.onError` çevirir
 * (bkz. universities.routes.ts başındaki not).
 */
export const facultiesRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. FAKÜLTELERİ LİSTELEME (public)
facultiesRoutes.get("/:universityId/faculties", async (c) => {
  const { universityId } = c.req.param();
  const faculties = await universityService.listFaculties(universityId);
  return ok(c, faculties, "faculty.listed");
});

// 2. TEK BİR FAKÜLTEYİ GETİRME (public)
facultiesRoutes.get("/:universityId/faculties/:facultyId", async (c) => {
  const { universityId, facultyId } = c.req.param();
  const faculty = await universityService.getFaculty(universityId, facultyId);
  return ok(c, faculty, "faculty.found");
});

// 3. FAKÜLTE OLUŞTURMA
facultiesRoutes.post(
  "/:universityId/faculties",
  ...guard(UniversityPermission.FACULTY_CREATE, { tenantScoped: true }),
  validate("json", createFacultySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    const faculty = await universityService.createFaculty(universityId, body);
    return created(c, faculty, "faculty.created");
  }
);

// 4. FAKÜLTE GÜNCELLEME
facultiesRoutes.patch(
  "/:universityId/faculties/:facultyId",
  ...guard(UniversityPermission.FACULTY_UPDATE, { tenantScoped: true }),
  validate("json", updateFacultySchema),
  async (c) => {
    const { universityId, facultyId } = c.req.param();
    const body = c.req.valid("json");
    const faculty = await universityService.updateFaculty(universityId, facultyId, body);
    return ok(c, faculty, "faculty.updated");
  }
);

// 5. FAKÜLTE SİLME (bölümü yoksa)
facultiesRoutes.delete(
  "/:universityId/faculties/:facultyId",
  ...guard(UniversityPermission.FACULTY_DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId, facultyId } = c.req.param();
    await universityService.deleteFaculty(universityId, facultyId);
    return done(c, "faculty.deleted");
  }
);
