import { logger } from "../shared/logger/logger";
import { isBusinessError } from "../shared/utils/error.util";
import { createErrorHandler } from "../core/http/error-handler";

const log = logger.child({ module: "error-handler" });

/**
 * Uygulamanın merkezi hata yakalayıcısı — taşınabilir `createErrorHandler`
 * fabrikasının bu projeye özel kurulumu: Türkçe fallback mesajı, projenin kök
 * logger'ı ve düz-Error konvansiyonu (`isBusinessError`) enjekte edilir.
 * Hata sınıflandırmasının tamamı core'da; bkz. `core/http/error-handler.ts`.
 */
export const errorHandler = createErrorHandler({
  logger: log,
  fallbackMessage: "Sunucu tarafında beklenmeyen bir hata oluştu.",
  isBusinessError,
});
