import { z } from "zod";

export const updateClubStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "archived"]),
});
export type UpdateClubStatusDTO = z.infer<typeof updateClubStatusSchema>;

export const listUsersQuerySchema = z.object({
  status: z.enum(["pending", "active", "suspended"]).optional(),
  role: z.string().min(1).max(100).optional(),
});
export type ListUsersQueryDTO = z.infer<typeof listUsersQuerySchema>;

export const listClubApplicationsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "revision_requested"]).optional(),
});
export type ListClubApplicationsQueryDTO = z.infer<typeof listClubApplicationsQuerySchema>;

export const listClubsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "archived"]).optional(),
});
export type ListClubsQueryDTO = z.infer<typeof listClubsQuerySchema>;

/**
 * Kulüp kurma başvurusunun REDDİ — gerekçe zorunlu. Öğrenci neyi düzelteceğini
 * bilmeden yeniden başvuramaz; gerekçesiz ret denetlenebilir bir karar değildir.
 * Gerekçe `clubApplicationApprovals.note`'a yazılır.
 */
export const rejectApplicationSchema = z.object({
  note: z.string().trim().min(10, "Ret gerekçesi en az 10 karakter olmalıdır.").max(1000),
});
export type RejectApplicationDTO = z.infer<typeof rejectApplicationSchema>;

/** Revizyon talebi — ret ile aynı gerekçe kuralı. */
export const requestRevisionApplicationSchema = z.object({
  note: z.string().trim().min(10, "Revizyon gerekçesi en az 10 karakter olmalıdır.").max(1000),
});
export type RequestRevisionApplicationDTO = z.infer<typeof requestRevisionApplicationSchema>;

/** Onayda not opsiyoneldir (bilgi amaçlı). */
export const approveApplicationSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type ApproveApplicationDTO = z.infer<typeof approveApplicationSchema>;

export const addAdvisorSchema = z.object({
  userId: z.string().uuid(),
});
export type AddAdvisorDTO = z.infer<typeof addAdvisorSchema>;

export const updateClubSchema = z.object({
  name: z.string().min(3).max(256).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url("Geçerli bir URL giriniz.").max(512).optional(),
  coverUrl: z.string().url("Geçerli bir URL giriniz.").max(512).optional(),
  joinPolicy: z.enum(["open", "approval_required"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateClubDTO = z.infer<typeof updateClubSchema>;

export const updateUserDepartmentSchema = z.object({
  departmentId: z.string().uuid().nullable(),
});
export type UpdateUserDepartmentDTO = z.infer<typeof updateUserDepartmentSchema>;
