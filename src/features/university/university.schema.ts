import { z } from "zod";
import { SUPPORTED_LOCALES } from "../../shared/i18n/translator";
import { isValidIanaTimezone } from "../../shared/utils/timezone";

/**
 * E-posta domain'i — HER ZAMAN küçük harfe indirgenir. Kayıt akışı tenant'ı
 * kullanıcının e-posta domain'inden bulur; burada "STD.Antalya.edu.tr" gibi bir
 * satır yazılırsa eşleşme kaçar ve o okulun öğrencileri kayıt olamaz.
 * DB tarafında da `university_domains_domain_lowercase` CHECK'i ile korunur.
 */
const domainField = z.string().trim().toLowerCase().min(3).max(256);

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
    domain: domainField,
    domainType: z.enum(["student", "staff"]),
  })).min(1, "En az bir domain girilmelidir."),
});
export type CreateUniversityDTO = z.infer<typeof createUniversitySchema>;

const localeField = z.enum(SUPPORTED_LOCALES);
const nullableUrl = z.string().url().max(2048).nullable().optional();
const nullableHexColor = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Renk #RGB veya #RRGGBB biçiminde olmalıdır.")
  .nullable()
  .optional();

const timezoneField = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidIanaTimezone, { message: "Geçerli bir IANA saat dilimi giriniz." });

export const updateUniversitySchema = z
  .object({
    name: z.string().min(2).max(256).optional(),
    slug: z.string().min(2).max(256).optional(),
    timezone: timezoneField.optional(),
    defaultLocale: localeField.optional(),
    logoUrl: nullableUrl,
    primaryColor: nullableHexColor,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Güncellenecek en az bir alan girilmelidir.",
  });
export type UpdateUniversityDTO = z.infer<typeof updateUniversitySchema>;

// ═══════════════════════════════════════════════
// DOMAIN
// ═══════════════════════════════════════════════
export const addDomainSchema = z.object({
  domain: domainField,
  domainType: z.enum(["student", "staff"]),
});
export type AddDomainDTO = z.infer<typeof addDomainSchema>;

export const updateDomainSchema = z.object({
  domain: domainField.optional(),
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
