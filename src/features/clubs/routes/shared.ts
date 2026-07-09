/**
 * clubs alt-kaynak route dosyalarının ortak yardımcısı. Service katmanı Türkçe
 * düz Error'lar fırlatır; mesajda "bulunamadı" geçiyorsa 404, aksi halde 400
 * döneriz (proje geneli konvansiyon — bkz. university/admin/auth routes).
 */
export const statusFromError = (message: string): 400 | 404 =>
  message.includes("bulunamadı") ? 404 : 400;
