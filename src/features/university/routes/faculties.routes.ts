import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { UniversityPermission } from "../university.permissions";
import { createFacultySchema, updateFacultySchema } from "../university.schema";
import { universityService } from "../university.service";
import { statusFromError } from "./shared";
import { respondWithBusinessError } from "../../../shared/utils/error.util";

/**
 * Üniversitenin fakülteleri (`:universityId/faculties`). Listeleme/getirme
 * PUBLIC (kayıt formu), yazma işlemleri granüler university.faculty.* izinleriyle
 * ve tenantScoped korunur.
 */
export const facultiesRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. FAKÜLTELERİ LİSTELEME (public)
facultiesRoutes.get("/:universityId/faculties", async (c) => {
  const { universityId } = c.req.param();
  try {
    const faculties = await universityService.listFaculties(universityId);
    return c.json({ success: true, message: "Fakülteler listelendi.", data: faculties });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 2. TEK BİR FAKÜLTEYİ GETİRME (public)
facultiesRoutes.get("/:universityId/faculties/:facultyId", async (c) => {
  const { universityId, facultyId } = c.req.param();
  try {
    const faculty = await universityService.getFaculty(universityId, facultyId);
    return c.json({ success: true, message: "Fakülte bulundu.", data: faculty });
  } catch (error) {
    return respondWithBusinessError(c, error, statusFromError);
  }
});

// 3. FAKÜLTE OLUŞTURMA
facultiesRoutes.post(
  "/:universityId/faculties",
  ...guard(UniversityPermission.FACULTY_CREATE, { tenantScoped: true }),
  zValidator("json", createFacultySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const faculty = await universityService.createFaculty(universityId, body);
      return c.json({ success: true, message: "Fakülte oluşturuldu.", data: faculty }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 4. FAKÜLTE GÜNCELLEME
facultiesRoutes.patch(
  "/:universityId/faculties/:facultyId",
  ...guard(UniversityPermission.FACULTY_UPDATE, { tenantScoped: true }),
  zValidator("json", updateFacultySchema),
  async (c) => {
    const { universityId, facultyId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const faculty = await universityService.updateFaculty(universityId, facultyId, body);
      return c.json({ success: true, message: "Fakülte güncellendi.", data: faculty });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 5. FAKÜLTE SİLME (bölümü yoksa)
facultiesRoutes.delete(
  "/:universityId/faculties/:facultyId",
  ...guard(UniversityPermission.FACULTY_DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId, facultyId } = c.req.param();
    try {
      await universityService.deleteFaculty(universityId, facultyId);
      return c.json({ success: true, message: "Fakülte silindi." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);
