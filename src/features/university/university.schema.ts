import { z } from "zod";

// ═══════════════════════════════════════════════
// ÜNİVERSİTE
// ═══════════════════════════════════════════════
export const listUniversitiesQuerySchema = z.object({
  search: z.string().min(1).max(256).optional(),
});
export type ListUniversitiesQueryDTO = z.infer<typeof listUniversitiesQuerySchema>;

export const createUniversitySchema = z.object({
  name: z.string().min(2).max(256),
  slug: z.string().min(2).max(256),
  domains: z.array(z.object({
    domain: z.string().min(3).max(256),
    domainType: z.enum(["student", "staff"]),
  })).min(1, "En az bir domain girilmelidir."),
});
export type CreateUniversityDTO = z.infer<typeof createUniversitySchema>;

export const updateUniversitySchema = z.object({
  name: z.string().min(2).max(256).optional(),
  slug: z.string().min(2).max(256).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateUniversityDTO = z.infer<typeof updateUniversitySchema>;

// ═══════════════════════════════════════════════
// DOMAIN
// ═══════════════════════════════════════════════
export const addDomainSchema = z.object({
  domain: z.string().min(3).max(256),
  domainType: z.enum(["student", "staff"]),
});
export type AddDomainDTO = z.infer<typeof addDomainSchema>;

export const updateDomainSchema = z.object({
  domain: z.string().min(3).max(256).optional(),
  domainType: z.enum(["student", "staff"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateDomainDTO = z.infer<typeof updateDomainSchema>;

// ═══════════════════════════════════════════════
// FAKÜLTE
// ═══════════════════════════════════════════════
export const createFacultySchema = z.object({
  name: z.string().min(2).max(256),
});
export type CreateFacultyDTO = z.infer<typeof createFacultySchema>;

export const updateFacultySchema = z.object({
  name: z.string().min(2).max(256),
});
export type UpdateFacultyDTO = z.infer<typeof updateFacultySchema>;

// ═══════════════════════════════════════════════
// BÖLÜM
// ═══════════════════════════════════════════════
export const createDepartmentSchema = z.object({
  name: z.string().min(2).max(256),
});
export type CreateDepartmentDTO = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: z.string().min(2).max(256),
});
export type UpdateDepartmentDTO = z.infer<typeof updateDepartmentSchema>;
