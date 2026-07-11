import { Hono } from "hono";
import { validate } from "../../../shared/utils/validate";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { ok, created, done } from "../../../shared/utils/respond";
import { UniversityPermission } from "../university.permissions";
import { createDepartmentSchema, updateDepartmentSchema } from "../university.schema";
import { universityService } from "../university.service";

/**
 * Fakültenin bölümleri (`:universityId/faculties/:facultyId/departments`).
 *
 * Not: departments tablosu universityId taşımaz (kasıtlı denormalize KAÇINMA),
 * bu yüzden bölüme her zaman faculty zinciri üzerinden ulaşılır. Listeleme/getirme
 * PUBLIC, yazma işlemleri granüler university.department.* izinleriyle ve
 * tenantScoped korunur.
 *
 * try/catch yok — servisin fırlattığı HttpError'ları `app.onError` çevirir
 * (bkz. universities.routes.ts başındaki not).
 */
export const departmentsRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. BÖLÜMLERİ LİSTELEME (public)
departmentsRoutes.get("/:universityId/faculties/:facultyId/departments", async (c) => {
  const { universityId, facultyId } = c.req.param();
  const departments = await universityService.listDepartments(universityId, facultyId);
  return ok(c, departments, "department.listed");
});

// 2. TEK BİR BÖLÜMÜ GETİRME (public)
departmentsRoutes.get("/:universityId/faculties/:facultyId/departments/:departmentId", async (c) => {
  const { universityId, facultyId, departmentId } = c.req.param();
  const department = await universityService.getDepartment(universityId, facultyId, departmentId);
  return ok(c, department, "department.found");
});

// 3. BÖLÜM OLUŞTURMA
departmentsRoutes.post(
  "/:universityId/faculties/:facultyId/departments",
  ...guard(UniversityPermission.DEPARTMENT_CREATE, { tenantScoped: true }),
  validate("json", createDepartmentSchema),
  async (c) => {
    const { universityId, facultyId } = c.req.param();
    const body = c.req.valid("json");
    const department = await universityService.createDepartment(universityId, facultyId, body);
    return created(c, department, "department.created");
  }
);

// 4. BÖLÜM GÜNCELLEME
departmentsRoutes.patch(
  "/:universityId/faculties/:facultyId/departments/:departmentId",
  ...guard(UniversityPermission.DEPARTMENT_UPDATE, { tenantScoped: true }),
  validate("json", updateDepartmentSchema),
  async (c) => {
    const { universityId, facultyId, departmentId } = c.req.param();
    const body = c.req.valid("json");
    const department = await universityService.updateDepartment(universityId, facultyId, departmentId, body);
    return ok(c, department, "department.updated");
  }
);

// 5. BÖLÜM SİLME (bağlı kullanıcı yoksa)
departmentsRoutes.delete(
  "/:universityId/faculties/:facultyId/departments/:departmentId",
  ...guard(UniversityPermission.DEPARTMENT_DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId, facultyId, departmentId } = c.req.param();
    await universityService.deleteDepartment(universityId, facultyId, departmentId);
    return done(c, "department.deleted");
  }
);
