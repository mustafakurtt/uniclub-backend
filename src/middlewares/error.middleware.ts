import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../shared/logger/logger";

const log = logger.child({ module: "error-handler" });

/**
 * Merkezi hata yakalayıcı — iki tür hatayı BİRBİRİNDEN AYIRIR:
 *
 * 1. BEKLENEN (iş kuralı) hatalar: servislerin bilinçli fırlattığı düz
 *    `new Error("Türkçe kullanıcı mesajı")`. Mesaj kullanıcıya aittir → 400 + mesaj.
 *
 * 2. BEKLENMEYEN hatalar: pg'nin DatabaseError'ı, TypeError, ağ hataları...
 *    Mesajları İSTEMCİYE SIZDIRILMAZ — "duplicate key ... club_members_user_id_idx"
 *    gibi tablo/indeks adları saldırgana iç yapıyı anlatır. 500 + jenerik mesaj
 *    döner, stack ise requestId ile birlikte SUNUCUDA loglanır (istemciye verilen
 *    requestId sayesinde kullanıcı bildirimi ile sunucu logu eşleştirilebilir).
 *
 * Ayrım sezgiseldir ama güvenlidir: servis katmanı hep `new Error(...)` (düz Error)
 * fırlatır; altyapı kütüphaneleri ise her zaman Error ALT SINIFLARI fırlatır
 * (pg → DatabaseError, ioredis → ReplyError, JS runtime → TypeError/RangeError...).
 */
const isExpectedBusinessError = (err: Error) => err.constructor === Error;

export const errorHandler = (err: Error, c: Context) => {
  const requestId: string | undefined = c.get("requestId");

  if (err instanceof HTTPException) {
    return c.json({ success: false, message: err.message, requestId }, err.status);
  }

  if (isExpectedBusinessError(err) && err.message) {
    return c.json({ success: false, message: err.message, requestId }, 400);
  }

  log.error(
    { requestId, method: c.req.method, path: c.req.path, err },
    "beklenmeyen hata"
  );
  return c.json(
    {
      success: false,
      message: "Sunucu tarafında beklenmeyen bir hata oluştu.",
      requestId,
    },
    500
  );
};
