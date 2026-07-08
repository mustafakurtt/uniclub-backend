/**
 * Alt-kaynak route dosyalarının (universities/domains/faculties/departments)
 * ortak kullandığı yardımcılar. Service katmanı Türkçe düz Error'lar fırlatır;
 * mesajda "bulunamadı" geçiyorsa 404, aksi halde 400 döneriz (proje geneli
 * konvansiyon — bkz. admin.routes / auth.routes).
 */
export const statusFromError = (message: string): 400 | 404 =>
  message.includes("bulunamadı") ? 404 : 400;
