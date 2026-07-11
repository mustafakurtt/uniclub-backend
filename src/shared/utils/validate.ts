import { createValidator } from "../../core/http/validation";
import { translate } from "../i18n/translator";
import type { MessageKey } from "../i18n/messages";

/**
 * Taşınabilir `createValidator` fabrikasının bu projeye özel kurulumu.
 *
 * - Üst mesaj: sabit "validation.failed" anahtarı (error-handler isteğin diline çevirir).
 * - Alan-bazlı detay: her zod issue'su `validation.field.<code>` anahtarına çevrilir;
 *   issue'nun kendisi param olarak geçer ({minimum}/{maximum}/{expected}...). Katalogda
 *   olmayan bir code için çevirmen anahtarı aynen döndürür → o alanda zod'un ham
 *   mesajına DÜŞERİZ (İngilizce olsa da bilgi kaybı olmaz).
 *
 * Kullanım: rotalarda `zValidator(...)` yerine `validate(...)`.
 */
const FAILED: MessageKey = "validation.failed";

export const validate = createValidator({
  translate,
  formatError: (error, t) => ({
    message: FAILED,
    details: error.issues.map((issue) => {
      const key = `validation.field.${issue.code}`;
      const translated = t(key, issue as unknown as Record<string, unknown>);
      return {
        path: issue.path.join("."),
        code: issue.code,
        // anahtar bulunamazsa t girdiyi aynen döndürür → zod'un ham mesajına düş
        message: translated === key ? issue.message : translated,
      };
    }),
  }),
});
