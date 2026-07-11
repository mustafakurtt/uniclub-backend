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

/**
 * Feature-bazlı katalog parçalarını tek bir kataloga birleştirir. Her feature
 * kendi mesajlarını kendi dosyasında tutar (bkz. `*.messages.ts`); kompozisyon
 * kökü (`shared/i18n/messages.ts`) bunları burada birleştirir — merkezî dev bir
 * mesaj dosyası dolmaz.
 *
 * Aynı (dil, anahtar) iki parçada tanımlıysa FIRLATIR: sessizce üzerine yazmak
 * yerine, iki feature'ın anahtar çakışmasını yükleme anında fail-fast yakalar.
 */
export function mergeCatalogs(...catalogs: Catalog[]): Catalog {
  const merged: Catalog = {};
  for (const catalog of catalogs) {
    for (const locale of Object.keys(catalog)) {
      const target = (merged[locale] ??= {});
      for (const key of Object.keys(catalog[locale])) {
        if (key in target) {
          throw new Error(`i18n katalog çakışması: "${key}" anahtarı "${locale}" dilinde birden fazla kez tanımlı.`);
        }
        target[key] = catalog[locale][key];
      }
    }
  }
  return merged;
}
