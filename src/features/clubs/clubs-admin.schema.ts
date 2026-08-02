import { z } from "zod";

export const updateClubStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "archived"]),
});
export type UpdateClubStatusDTO = z.infer<typeof updateClubStatusSchema>;

export const listClubsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "archived"]).optional(),
});
export type ListClubsQueryDTO = z.infer<typeof listClubsQuerySchema>;

export const addAdvisorSchema = z.object({
  userId: z.string().uuid(),
  message: z.string().max(2000).optional(),
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

/** Kulüp alt-kaynak admin listeleri — keyset sayfalama (`createdAt` ISO cursor). */
export const adminClubPaginatedListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().datetime().optional(),
});
export type AdminClubPaginatedListQueryDTO = z.infer<typeof adminClubPaginatedListQuerySchema>;

export const listFormationProposalsQuerySchema = z.object({
  status: z.enum(["collecting_support", "submitted", "withdrawn", "expired"]).optional(),
});
export type ListFormationProposalsQueryDTO = z.infer<typeof listFormationProposalsQuerySchema>;
