import { z } from "zod";

// GET /api/feed?limit=&cursor= — keyset sayfalama (opak cursor: at+kind+id tie-break).
export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).optional(),
});
export type FeedQueryDTO = z.infer<typeof feedQuerySchema>;
