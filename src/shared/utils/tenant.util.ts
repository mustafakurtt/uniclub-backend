/**
 * Bir üniversiteye bağlı (tenant'lı) akışların girişinde kullanılır.
 *
 * `users.universityId` platform hesaplarında NULL'dır (super_admin,
 * platform_support, ileride call_center vb. — bkz. db/schema.ts). Bu hesapların
 * öğrenci/üye self-service akışlarında (kulüp listeleme, katılma, başvuru,
 * duyuru oluşturma) işi yoktur: tenant'ları olmadığı için hangi okulun
 * kulüplerini görecekleri tanımsızdır.
 *
 * Hata, feature'ların yerleşik kalıbına uygun olarak düz bir `Error`'dur;
 * route'lardaki try/catch (ya da app.onError) bunu 400'e çevirir.
 */
export function requireTenant(universityId: string | null): string {
  if (!universityId) {
    throw new Error("Bu işlem bir üniversiteye bağlı hesap gerektirir.");
  }
  return universityId;
}
