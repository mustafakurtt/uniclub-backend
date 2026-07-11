import type { Context } from "hono";

/**
 * Başarılı cevap zarfı yardımcıları. core/ tüm API zarfının tek sahibi:
 * hata tarafında `error-handler` `{ success:false, message, ... }` üretiyor;
 * burası onun simetriği olan `{ success:true, message, data? }`'yi üretir.
 * Böylece her rota elle `c.json({ success:true, ... })` yazmaz — şablon sadeleşir
 * ve zarf hiçbir yerde elle "success:false" gibi bir tutarsızlığa kaymaz.
 *
 * Zarf şekli (success/message/data) bilinçli olarak core'da SABİT; dil değil,
 * yapı burada. Mesajlar (Türkçe) çağrı yerinden gelir — core dil bilmez.
 *
 * İsimlendirme notu: mesaj-only mutasyonlar (silme vb.) için `done` kullanılır.
 * Kasıtlı olarak HTTP 204 DEĞİL 200 + mesaj döner: zarfımız kullanıcıya
 * gösterilecek başarı mesajını (ve requestId korelasyonunu) taşımalı, 204'ün
 * gövdesi olamaz.
 */
export function ok<T>(c: Context, data: T, message: string) {
  return c.json({ success: true, message, data }, 200);
}

export function created<T>(c: Context, data: T, message: string) {
  return c.json({ success: true, message, data }, 201);
}

export function done(c: Context, message: string) {
  return c.json({ success: true, message }, 200);
}
