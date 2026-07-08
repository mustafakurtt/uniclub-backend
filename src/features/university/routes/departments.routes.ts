import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { UniversityPermission } from "../university.permissions";
import { createDepartmentSchema, updateDepartmentSchema } from "../university.schema";
import { universityService } from "../university.service";
import { statusFromError } from "./shared";
import { respondWithBusinessError } from "../../../shared/utils/error.util";

/**
 * Fakültenin bölümleri (`:universityId/faculties/:facultyId/departments`).
 *
 * Not: departments tablosu universityId taşımaz (kasıtlı denormalize KAÇINMA),
 * bu yüzden bölüme her zaman faculty zinciri üzerinden ulaşılır. Listeleme/getirme
 * PUBLIC, yazma işlemleri granüler university.department.* izinleriyle ve
 * tenantScoped korunur.
 */
export const departmentsRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. BÖLÜMLERİ LİSTELEME (public)
departmentsRoutes.get("/:universityId/faculties/:facultyId/departments", async (c) => {
  const { universityId, facultyId } = c.req.param();
  try {
    const departments = await universityService.listDepartments(universityId, facultyId);
    return c.json({ success: true, message: "Bölümler listelendi.", data: departments });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 2. TEK BİR BÖLÜMÜ GETİRME (public)
departmentsRoutes.get("/:universityId/faculties/:facultyId/departments/:departmentId", async (c) => {
  const { universityId, facultyId, departmentId } = c.req.param();
  try {
    const department = await universityService.getDepartment(universityId, facultyId, departmentId);
    return c.json({ success: true, message: "Bölüm bulundu.", data: department });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 3. BÖLÜM OLUŞTURMA
departmentsRoutes.post(
  "/:universityId/faculties/:facultyId/departments",
  ...guard(UniversityPermission.DEPARTMENT_CREATE, { tenantScoped: true }),
  zValidator("json", createDepartmentSchema),
  async (c) => {
    const { universityId, facultyId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const department = await universityService.createDepartment(universityId, facultyId, body);
      return c.json({ success: true, message: "Bölüm oluşturuldu.", data: department }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 4. BÖLÜM GÜNCELLEME
departmentsRoutes.patch(
  "/:universityId/faculties/:facultyId/departments/:departmentId",
  ...guard(UniversityPermission.DEPARTMENT_UPDATE, { tenantScoped: true }),
  zValidator("json", updateDepartmentSchema),
  async (c) => {
    const { universityId, facultyId, departmentId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const department = await universityService.updateDepartment(universityId, facultyId, departmentId, body);
      return c.json({ success: true, message: "Bölüm güncellendi.", data: department });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 5. BÖLÜM SİLME (bağlı kullanıcı yoksa)
departmentsRoutes.delete(
  "/:universityId/faculties/:facultyId/departments/:departmentId",
  ...guard(UniversityPermission.DEPARTMENT_DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId, facultyId, departmentId } = c.req.param();
    try {
      await universityService.deleteDepartment(universityId, facultyId, departmentId);
      return c.json({ success: true, message: "Bölüm silindi." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);
