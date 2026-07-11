import { logger } from "../shared/logger/logger";
import { isBusinessError } from "../shared/utils/error.util";
import { createErrorHandler } from "../core/http/error-handler";
import { translate } from "../shared/i18n/translator";

const log = logger.child({ module: "error-handler" });

/**
 * Uygulamanın merkezi hata yakalayıcısı — taşınabilir `createErrorHandler`
 * fabrikasının bu projeye özel kurulumu: fallback mesaj anahtarı, projenin kök
 * logger'ı, düz-Error konvansiyonu (`isBusinessError`) ve çevirmen enjekte edilir.
 * Hata sınıflandırması + çeviri mantığı core'da; bkz. `core/http/error-handler.ts`.
 */
export const errorHandler = createErrorHandler({
  logger: log,
  fallbackMessage: "server.unexpected",
  isBusinessError,
  translate,
});
