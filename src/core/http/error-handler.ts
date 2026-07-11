import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Logger } from "../logger/logger";
import { isHttpError } from "./errors";

/**
 * Taşınabilir merkezi hata yakalayıcı FABRİKASI. core/ proje-bağımsız kalsın
 * diye dil (Türkçe fallback), logger ve "eski düz Error'lar iş hatası mı?"
 * konvansiyonu DIŞARIDAN enjekte edilir — aynı desen `createLogger` /
 * `setGuardAuditSink` ile kullanılıyor (core mekanizmayı tanımlar, proje kurar).
 *
 * Hata sınıflandırma sırası:
 *   1. Hono `HTTPException`      → kendi status'u + mesajıyla döner.
 *   2. `HttpError` (bizim sözleşme, expose) → status'unu KENDİ taşır (+ code).
 *   3. Eski düz Error konvansiyonu (opsiyonel classifier) → 400. HttpError'a
 *      geçiş bitene kadarki GERİ UYUM dikişi; bu proje `err.constructor === Error`
 *      kullanır ama core bunu bilmez, enjekte edilir.
 *   4. Diğer her şey (altyapı) → loglanır, jenerik fallback 500. Mesaj SIZMAZ.
 */
export interface ErrorHandlerOptions {
  logger: Logger;
  /** Beklenmeyen (altyapı) hatalarda istemciye dönen jenerik mesaj. */
  fallbackMessage: string;
  /**
   * Proje konvansiyonuna göre "bu düz Error aslında bir iş kuralı hatası mı?".
   * Verilmezse yalnızca HttpError/HTTPException iş hatası sayılır.
   */
  isBusinessError?: (error: unknown) => error is Error;
  /** requestId'yi context'ten okuma yolu (proje konvansiyonu). Varsayılan `c.get("requestId")`. */
  getRequestId?: (c: Context) => string | undefined;
}

export function createErrorHandler(options: ErrorHandlerOptions) {
  const {
    logger,
    fallbackMessage,
    isBusinessError,
    getRequestId = (c) => c.get("requestId"),
  } = options;

  return (err: Error, c: Context) => {
    const requestId = getRequestId(c);

    if (err instanceof HTTPException) {
      return c.json({ success: false, message: err.message, requestId }, err.status);
    }

    if (isHttpError(err) && err.expose) {
      return c.json(
        {
          success: false,
          message: err.message,
          ...(err.code ? { code: err.code } : {}),
          ...(err.details !== undefined ? { details: err.details } : {}),
          requestId,
        },
        err.status
      );
    }

    if (isBusinessError?.(err) && err.message) {
      return c.json({ success: false, message: err.message, requestId }, 400);
    }

    logger.error({ requestId, method: c.req.method, path: c.req.path, err }, "beklenmeyen hata");
    return c.json({ success: false, message: fallbackMessage, requestId }, 500);
  };
}
