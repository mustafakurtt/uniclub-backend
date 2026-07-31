/**
 * Serialization stratejisi (SRP: depolamadan ayrı). `Cache` facade tipli değerleri
 * bununla string'e/tekrar geri çevirir. İleride msgpack vb. takılabilir — store'lara
 * hiç dokunmadan.
 */
export interface Codec {
  encode<T>(value: T): string;
  decode<T>(raw: string): T;
}

/**
 * Düz JSON codec. DİKKAT: `Date`'i string'e çevirir ve round-trip'te GERİ GETİRMEZ.
 * Cache'lenen veri yalnızca JSON cevabına gidiyorsa zararsızdır (aynı ISO string
 * üretilir); ama YAZMA-YOLU mantığında kullanılıyorsa (`startsAt.getTime()`)
 * çalışma anında patlar. Bu yüzden varsayılan `richCodec`'tir — bunu yalnızca
 * bilinçli olarak (ör. dış bir sistemle format uyumu) seçin.
 */
export const jsonCodec: Codec = {
  encode: (value) => JSON.stringify(value),
  decode: (raw) => JSON.parse(raw),
};

/**
 * `Date`'i KORUYAN varsayılan codec.
 *
 * Neden gerekli: cache'ten dönen bir Drizzle satırının `createdAt`'i düz JSON'da
 * string'e döner. Sunucu bunu doğrudan cevaba yazıyorsa fark edilmez; ama aynı
 * veri bir iş kuralında kullanılırsa (`activity.startsAt.getTime()`) `TypeError`
 * fırlatır — bu projede bir kez yaşandı ve o çağrı yerinde elle `new Date(x)` ile
 * yamandı. Codec seviyesinde çözmek tuzağı bütünüyle kaldırır.
 *
 * Yöntem: `Date` → `{"__d":"<ISO>"}` şeklinde TEK ANAHTARLI bir işaretçi nesne.
 * ISO'ya benzeyen string'leri regex'le tahmin eden "reviver" yaklaşımlarından
 * bilinçli olarak kaçınıldı: onlar tarih GİBİ görünen gerçek string'leri (ör.
 * kullanıcının yazdığı bir tarih metni) sessizce `Date`'e çevirirdi.
 *
 * Çakışma riski: veride "tam olarak tek bir `__d` alanı olan ve değeri string
 * olan" bir nesne bulunursa decode onu `Date` sanar. Bu şema Drizzle satırlarında
 * ve DTO'larda pratikte imkânsızdır; kaçış mekanizması EKLENMEDİ çünkü kaçışın
 * kendisi (sarmalanan nesnenin yeniden sarmalanması) özyineleme hatasına açık bir
 * karmaşıklık getiriyordu. Kural: cache'lenen veride `__d` alan adı kullanmayın.
 *
 * GEÇİŞ: format değiştiği için ESKİ (düz JSON) girdiler yanlış decode edilmez —
 * yalnızca `__d` işaretçisi taşımadıkları için `Date` üretmezler, yani eski
 * davranışa döner ve TTL dolunca yenisiyle değişirler. Ayrı bir migration gerekmez.
 */
const DATE_KEY = "__d";

export const richCodec: Codec = {
  encode: (value) => JSON.stringify(value, dateReplacer),
  decode: (raw) => JSON.parse(raw, dateReviver),
};

/**
 * `JSON.stringify` replacer'ı.
 *
 * İncelik: replacer'a gelen `value`, nesnenin kendi `toJSON()`'u ÇAĞRILDIKTAN
 * SONRAKİ hâlidir — `Date` için bu zaten bir string olur, yani `value instanceof
 * Date` ASLA doğru çıkmaz. Gerçek `Date`'i yakalamak için ham değere bakmak
 * gerekir; ona da replacer'ın `this`'i (değeri taşıyan nesne/dizi) üzerinden
 * erişilir.
 */
function dateReplacer(this: unknown, key: string, value: unknown): unknown {
  const original = (this as Record<string, unknown>)[key];
  if (original instanceof Date) {
    // Geçersiz Date (`new Date("abc")`) → toISOString() fırlatır; null'a düşür.
    return Number.isNaN(original.getTime()) ? null : { [DATE_KEY]: original.toISOString() };
  }
  return value;
}

function dateReviver(_key: string, value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[DATE_KEY] === "string"
  ) {
    const keys = Object.keys(value);
    if (keys.length === 1) return new Date((value as Record<string, string>)[DATE_KEY]);
  }
  return value;
}
