import { createResponder } from "../../core/http/respond";
import { translate } from "../i18n/translator";
import type { MessageKey } from "../i18n/messages";

/**
 * Taşınabilir `createResponder` fabrikasının bu projeye özel kurulumu: çevirmen
 * enjekte edilir, böylece başarı mesajları da (hata tarafı gibi) isteğin diline
 * göre döner. `MessageKey` ile tiplenir → rotalar yalnızca GEÇERLİ anahtar
 * verebilir; yazım hatası derleme hatasıdır (örn. "university.created").
 */
export const { ok, created, done } = createResponder<MessageKey>({ translate });
