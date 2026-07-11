import { createResponder } from "../../core/http/respond";
import { translate } from "../i18n/translator";

/**
 * Taşınabilir `createResponder` fabrikasının bu projeye özel kurulumu: çevirmen
 * enjekte edilir, böylece başarı mesajları da (hata tarafı gibi) isteğin diline
 * göre döner. Rotalar mesaj yerine ANAHTAR verir (örn. "university.created").
 */
export const { ok, created, done } = createResponder({ translate });
