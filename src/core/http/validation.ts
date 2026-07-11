import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodError, ZodType } from "zod";
import { ValidationError } from "./errors";

/**
 * Taşınabilir doğrulama katmanı. `@hono/zod-validator`'ın varsayılan davranışı
 * ham `ZodError`'u bizim zarfımız DIŞINDA döndürür (message/requestId/code yok,
 * iç zod yapısı + İngilizce metin sızar). Bu fabrika onu sarıp doğrulama
 * başarısızsa `ValidationError` FIRLATIR — böylece hata, iş/altyapı hatalarıyla
 * AYNI `app.onError` (core/http/error-handler) yolundan geçer: tek hata çıkışı.
 *
 * core/ dil bilmez: ZodError'un kullanıcıya nasıl gösterileceği (mesaj + detay)
 * `formatZodError` ile enjekte edilir — aynı desen `createLogger` /
 * `createErrorHandler` ile kullanılıyor. Çok dilli hataya geçişte yalnızca bu
 * formatter değişir; detaylarda zod issue `code`'u taşındığı için çeviri anahtarı
 * hazır olur.
 */
export interface CreateValidatorOptions {
  formatZodError: (error: ZodError) => { message: string; details?: unknown };
}

export function createValidator({ formatZodError }: CreateValidatorOptions) {
  return <Target extends keyof ValidationTargets, Schema extends ZodType>(
    target: Target,
    schema: Schema
  ) =>
    zValidator(target, schema, (result) => {
      if (!result.success) {
        // @hono/zod-validator sonucu core `$ZodError` olarak etiketler; runtime'da
        // nesne gerçek classic `ZodError`'dur, bu yüzden cast tipçe güvenlidir.
        const { message, details } = formatZodError(result.error as unknown as ZodError);
        throw new ValidationError(message, { details });
      }
    });
}
