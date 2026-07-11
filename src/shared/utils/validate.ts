import { createValidator } from "../../core/http/validation";

/**
 * Taşınabilir `createValidator` fabrikasının bu projeye özel kurulumu:
 * ZodError'u Türkçe bir üst mesaj + alan-bazlı detay listesine çevirir.
 *
 * `details[].code`: zod issue kodu (örn. "too_small") — çok dilli hataya
 * geçişte çeviri anahtarı olarak kullanılabilir. `details[].message` şimdilik
 * zod'un ham (İngilizce) metni; i18n adımında koddan üretilecek.
 *
 * Kullanım: rotalarda `zValidator(...)` yerine `validate(...)`.
 */
export const validate = createValidator({
  formatZodError: (error) => ({
    message: "Girdi doğrulaması başarısız.",
    details: error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    })),
  }),
});
