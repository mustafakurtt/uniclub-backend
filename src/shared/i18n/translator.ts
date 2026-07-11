import { createTranslator } from "../../core/i18n/translator";
import { messages } from "./messages";

/**
 * Bu projenin desteklediği diller ve varsayılan. Yeni dil eklemek = messages.ts'e
 * bir kolon + buraya bir eleman (kod değişmez). Varsayılan `tr`: katalogda eksik
 * anahtar/dil olursa Türkçeye düşülür.
 */
export const SUPPORTED_LOCALES = ["tr", "en"] as const;
export const DEFAULT_LOCALE = "tr";

/** Uygulamanın tek çevirmeni — error-handler'a enjekte edilir. */
export const translate = createTranslator(messages, DEFAULT_LOCALE);
