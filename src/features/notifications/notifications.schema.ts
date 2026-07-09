import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Son görülen bildirimin `createdAt`'i (ISO 8601). Keyset sayfalama. */
  cursor: z.string().datetime().optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
