import { Context, Next } from "hono";
import { logger } from "../shared/logger/logger";

/**
 * `hono/logger()`'ın (renkli metin) yerini alır: her istek için tek satır
 * yapılandırılmış JSON. `requestId` ile birlikte loglanır ki istemciye dönen
 * requestId ile bu satır eşleştirilebilsin (bkz. error.middleware.ts).
 */
const log = logger.child({ module: "http" });

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;
  const requestId: string | undefined = c.get("requestId");
  const status = c.res.status;

  const fields = { requestId, method: c.req.method, path: c.req.path, status, durationMs };

  if (status >= 500) log.error(fields, "istek hata ile tamamlandı");
  else if (status >= 400) log.warn(fields, "istek başarısız");
  else log.info(fields, "istek tamamlandı");
}
