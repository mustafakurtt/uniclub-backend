import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Son görülen bildirimin `createdAt`'i (ISO 8601). Keyset sayfalama. */
  cursor: z.string().datetime().optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/** Tarayıcının `PushSubscription.toJSON()` çıktısı — cihazı push için kaydeder. */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

/** Aboneliği endpoint'e göre siler. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
