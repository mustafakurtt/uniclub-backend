import { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isHttpError } from "../../core/http/errors";

/**
 * Servis katmanının bilinçli fırlattığı İŞ KURALI hatası mı?
 *
 * Sözleşme: servisler kullanıcıya gösterilecek hataları ya taşınabilir
 * `HttpError` (status'unu kendi taşır — tercih edilen) ya da düz
 * `new Error("Türkçe mesaj")` olarak fırlatır. Altyapı hataları ise her zaman
 * Error'ın ALT SINIFLARIDIR (pg → DatabaseError, drizzle → DrizzleQueryError,
 * runtime → TypeError...). Bu düz-Error ayrımı `core/http/error-handler.ts`'e
 * enjekte edilir ve HttpError'a tam geçiş bitene kadarki geri uyum dikişidir.
 */
export const isBusinessError = (error: unknown): error is Error =>
  error instanceof Error && error.constructor === Error && error.message.length > 0;

/**
 * Rota catch bloklarının ortak cevaplayıcısı.
 *
 * `HttpError`  → status'unu (+ code) KENDİ taşır; artık mesajdan çıkarılmaz.
 * Düz iş hatası → `statusFromMessage` ile (varsayılan 400). HttpError'a geçiş
 *                 bitmemiş feature'lar için geri uyum.
 * Altyapı hatası → YENİDEN FIRLATILIR ve app.onError'a düşer: istemci jenerik
 *                 500 + requestId alır, stack sunucuda loglanır (SQL/kolon
 *                 adları istemciye SIZMAZ).
 */
export function respondWithBusinessError(
  c: Context,
  error: unknown,
  statusFromMessage: (message: string) => ContentfulStatusCode = () => 400
) {
  if (isHttpError(error)) {
    return c.json(
      {
        success: false,
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      error.status
    );
  }
  if (!isBusinessError(error)) throw error;
  return c.json({ success: false, message: error.message }, statusFromMessage(error.message));
}
