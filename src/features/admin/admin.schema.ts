import { z } from "zod";

export const updateUserStatusSchema = z.object({
  status: z.enum(["pending", "active", "suspended"]),
});
export type UpdateUserStatusDTO = z.infer<typeof updateUserStatusSchema>;

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
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});
export type ListClubApplicationsQueryDTO = z.infer<typeof listClubApplicationsQuerySchema>;

export const listClubsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "archived"]).optional(),
});
export type ListClubsQueryDTO = z.infer<typeof listClubsQuerySchema>;

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
