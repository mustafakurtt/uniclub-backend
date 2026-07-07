import { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Servis katmanının bilinçli fırlattığı İŞ KURALI hatası mı?
 *
 * Sözleşme: servisler kullanıcıya gösterilecek hataları her zaman düz
 * `new Error("Türkçe mesaj")` olarak fırlatır. Altyapı hataları ise her zaman
 * Error'ın ALT SINIFLARIDIR (pg → DatabaseError, drizzle → DrizzleQueryError,
 * runtime → TypeError...). Bu ayrım error.middleware.ts ile ortaktır.
 */
export const isBusinessError = (error: unknown): error is Error =>
  error instanceof Error && error.constructor === Error && error.message.length > 0;

/**
 * Rota catch bloklarının ortak cevaplayıcısı.
 *
 * İş kuralı hatası → kullanıcıya mesajıyla döner (statusFromMessage ile 400/404...).
 * Altyapı hatası → YENİDEN FIRLATILIR ve app.onError'a düşer: istemci jenerik
 * 500 + requestId alır, stack sunucuda loglanır. Böylece "Failed query: select ..."
 * gibi tablo/kolon adı taşıyan mesajlar istemciye SIZMAZ.
 */
export function respondWithBusinessError(
  c: Context,
  error: unknown,
  statusFromMessage: (message: string) => ContentfulStatusCode = () => 400
) {
  if (!isBusinessError(error)) throw error;
  return c.json({ success: false, message: error.message }, statusFromMessage(error.message));
}
