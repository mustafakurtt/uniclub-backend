import { z } from "zod";

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Son görülen kaydın `createdAt`'i (ISO 8601). Keyset sayfalama. */
  cursor: z.string().datetime().optional(),
  /** "Bu aktör neler yaptı?" filtresi. */
  actorId: z.string().uuid().optional(),
  /** Yetki anahtarına göre filtre: "user.manage", "club.approve"... */
  action: z.string().max(128).optional(),
  /** "Bu kaynağa kimler dokundu?" filtresi. */
  targetId: z.string().max(128).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
