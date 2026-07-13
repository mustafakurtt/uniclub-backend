import { z } from "zod";

export const banUserSchema = z.object({
  reason: z.string().min(3, "Ban sebebi en az 3 karakter olmalı.").max(500),
});
export type BanUserDTO = z.infer<typeof banUserSchema>;

/** Aktivite (audit) ve moderasyon geçmişi için ortak cursor sayfalama sorgusu. */
export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ActivityQueryDTO = z.infer<typeof activityQuerySchema>;
