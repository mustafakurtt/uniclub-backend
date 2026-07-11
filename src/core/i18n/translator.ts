/**
 * Bağımlılıksız, minik çevirmen. Ağır i18n kütüphaneleri (çoğullaştırma, ICU
 * mesaj formatı, namespace, lazy-load, backend loader...) bir backend hata
 * kataloğu için fazladır. İhtiyacımız olan tek şey: anahtar → şablon araması,
 * `{param}` interpolasyonu ve dil fallback'i.
 *
 * core/ dil bilmez: katalog (tr/en metinleri) PROJE verisidir, dışarıdan verilir
 * (aynı createLogger/createErrorHandler enjeksiyon deseni).
 *
 * KRİTİK geri-uyum: anahtar katalogda yoksa GİRDİ OLDUĞU GİBİ döner. Böylece
 * anahtara göç etmemiş kod (düz Türkçe metin fırlatan feature'lar) bozulmadan
 * geçer — çevirmen onların metnini "anahtar" sanıp bulamaz ve aynen döndürür.
 */
export type Catalog = Record<string, Record<string, string>>;

export type Translate = (
  key: string,
  locale: string,
  params?: Record<string, unknown>
) => string;

export function createTranslator(catalog: Catalog, defaultLocale: string): Translate {
  const interpolate = (tpl: string, params?: Record<string, unknown>) =>
    params
      ? tpl.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
      : tpl;

  return (key, locale, params) => {
    // dil → varsayılan dil → anahtarın kendisi (geri uyum)
    const template = catalog[locale]?.[key] ?? catalog[defaultLocale]?.[key] ?? key;
    return interpolate(template, params);
  };
}
