import { badRequest } from "./errors";

/**
 * Bir üniversiteye bağlı (tenant'lı) akışların girişinde kullanılır.
 *
 * `users.universityId` platform hesaplarında NULL'dır (super_admin,
 * platform_support, ileride call_center vb. — bkz. db/schema.ts). Bu hesapların
 * öğrenci/üye self-service akışlarında (kulüp listeleme, katılma, başvuru,
 * duyuru oluşturma) işi yoktur: tenant'ları olmadığı için hangi okulun
 * kulüplerini görecekleri tanımsızdır.
 *
 * Çapraz-kesen (feature'a özel olmayan) bir yardımcı olduğu için mesaj anahtarı
 * `common.messages.ts`'te yaşar (aynı validation/rbac anahtarları gibi).
 */
export function requireTenant(universityId: string | null): string {
  if (!universityId) {
    throw badRequest("tenant.required");
  }
  return universityId;
}
