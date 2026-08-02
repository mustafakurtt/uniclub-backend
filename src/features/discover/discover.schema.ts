import { z } from "zod";

export const listDiscoverActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).optional(),
  universityId: z.string().uuid("Geçerli bir üniversite id'si giriniz.").optional(),
});
export type ListDiscoverActivitiesQueryDTO = z.infer<typeof listDiscoverActivitiesQuerySchema>;
