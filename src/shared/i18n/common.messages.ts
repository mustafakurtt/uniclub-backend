import { defineCatalog } from "../../core/i18n/translator";

/**
 * Çapraz-kesen (feature'a ait olmayan) mesajlar: doğrulama ve altyapı hatası.
 * Feature mesajları ilgili feature'ın `*.messages.ts` dosyasında yaşar.
 */
export const commonMessages = defineCatalog({
  tr: {
    "validation.failed": "Girdi doğrulaması başarısız.",
    "server.unexpected": "Sunucu tarafında beklenmeyen bir hata oluştu.",
    // kimlik doğrulama (core/auth/auth.middleware)
    "auth.tokenMissing": "Bu işlem için giriş yapmalısınız (token eksik).",
    "auth.tokenInvalid": "Oturum süreniz dolmuş veya token geçersiz. Lütfen tekrar giriş yapın.",
    // yetkilendirme (core/rbac/rbac.middleware)
    "rbac.accountSuspended": "Hesabınız askıya alınmıştır. Lütfen SKS birimiyle iletişime geçin.",
    "rbac.forbidden": "Bu işlem için yetkiniz bulunmamaktadır.",
    "rbac.tenantForbidden": "Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır.",
    // alan-bazlı zod issue mesajları (validate.ts, issue.code'undan üretir)
    "validation.field.too_small": "Değer çok küçük (en az {minimum}).",
    "validation.field.too_big": "Değer çok büyük (en fazla {maximum}).",
    "validation.field.invalid_type": "Geçersiz tür (beklenen {expected}).",
    "validation.field.invalid_format": "Geçersiz biçim.",
    "validation.field.invalid_value": "Geçersiz değer.",
    "validation.field.unrecognized_keys": "Tanınmayan alan gönderildi.",
  },
  en: {
    "validation.failed": "Validation failed.",
    "server.unexpected": "An unexpected error occurred on the server.",
    // authentication (core/auth/auth.middleware)
    "auth.tokenMissing": "You must be signed in for this action (token missing).",
    "auth.tokenInvalid": "Your session has expired or the token is invalid. Please sign in again.",
    // authorization (core/rbac/rbac.middleware)
    "rbac.accountSuspended": "Your account has been suspended. Please contact the student affairs office.",
    "rbac.forbidden": "You do not have permission for this action.",
    "rbac.tenantForbidden": "You do not have access to resources of this university.",
    // field-level zod issue messages (produced by validate.ts from issue.code)
    "validation.field.too_small": "Too small (min {minimum}).",
    "validation.field.too_big": "Too large (max {maximum}).",
    "validation.field.invalid_type": "Invalid type (expected {expected}).",
    "validation.field.invalid_format": "Invalid format.",
    "validation.field.invalid_value": "Invalid value.",
    "validation.field.unrecognized_keys": "Unrecognized key(s) sent.",
  },
});

/** Çapraz-kesen (feature'a ait olmayan) geçerli mesaj anahtarları. */
export type CommonMessageKey = keyof (typeof commonMessages)["tr"];
