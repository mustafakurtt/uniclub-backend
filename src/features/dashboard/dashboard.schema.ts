import { z } from "zod";

// GET /api/feed?limit=&cursor= — keyset sayfalama (cursor = son öğenin ISO createdAt'i).
export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().datetime().optional(),
});
export type FeedQueryDTO = z.infer<typeof feedQuerySchema>;
