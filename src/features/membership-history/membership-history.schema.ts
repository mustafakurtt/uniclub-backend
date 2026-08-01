import { z } from "zod";

export const listMembershipHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().datetime({ offset: true }).optional(),
  academicTermId: z.string().uuid().optional(),
});
export type ListMembershipHistoryQuery = z.infer<typeof listMembershipHistoryQuerySchema>;
