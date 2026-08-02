import { z } from "zod";

export const listUsersQuerySchema = z.object({
  status: z.enum(["pending", "active", "suspended"]).optional(),
  role: z.string().min(1).max(100).optional(),
});
export type ListUsersQueryDTO = z.infer<typeof listUsersQuerySchema>;

export const updateUserDepartmentSchema = z.object({
  departmentId: z.string().uuid().nullable(),
});
export type UpdateUserDepartmentDTO = z.infer<typeof updateUserDepartmentSchema>;
