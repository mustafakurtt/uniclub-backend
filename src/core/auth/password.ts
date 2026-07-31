/**
 * Taşınabilir şifre hash yardımcıları. Bun.password varsayılan olarak bcrypt
 * kullanır (cost 10). Config gerektirmez; core'da doğrudan durur.
 */

/** Düz metin şifreyi güvenli bir hash'e çevirir. */
export const hashPassword = async (password: string): Promise<string> =>
  await Bun.password.hash(password);

/** Girilen şifre ile saklanan hash'i karşılaştırır. */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> =>
  await Bun.password.verify(password, hash);

/**
 * Kullanıcı yoksa bile sabit dummy hash'e karşı doğrulama yapar — login timing
 * enumeration'ını önler. hash null/undefined ise sonuç her zaman false.
 */
let timingDummyHash: string | undefined;

async function timingDummyHashValue(): Promise<string> {
  if (!timingDummyHash) {
    timingDummyHash = await Bun.password.hash("uniclub-timing-equalizer-v1");
  }
  return timingDummyHash;
}

export async function verifyPasswordOrDummy(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await Bun.password.verify(password, await timingDummyHashValue());
    return false;
  }
  return await verifyPassword(password, hash);
}

/**
 * Karakter sınıfları AYRI sabitler olarak durur; tek bir birleşik alfabede
 * "büyük harfler 0-25 arasındadır" gibi varsayımlar yapılamasın diye. Karışması
 * kolay karakterler bilinçli olarak DIŞARIDA: `I`/`O` (büyük), `l` (küçük),
 * `0`/`1` (rakam) — geçici şifre çoğu zaman elle okunup yazılır.
 */
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";
const ALPHABET = UPPERCASE + LOWERCASE + DIGITS;

/**
 * Modulo YANLILIĞI olmadan tek karakter seçer. `byte % n` doğrudan kullanılamaz:
 * 256 çoğu alfabe uzunluğuna tam bölünmez, bu yüzden ilk karakterler diğerlerinden
 * daha sık çıkar. Aralığın son (kısmi) turuna düşen baytlar ELENİR ve yenisi
 * çekilir (rejection sampling) — dağılım tam düzgün olur.
 */
const pickChar = (alphabet: string): string => {
  const limit = 256 - (256 % alphabet.length); // kabul edilen en büyük tam katı
  const buffer = new Uint8Array(1);
  let byte: number;
  do {
    crypto.getRandomValues(buffer);
    byte = buffer[0];
  } while (byte >= limit);
  return alphabet[byte % alphabet.length];
};

/**
 * Kriptografik olarak güçlü, okunabilir geçici şifre üretir (örn. admin şifre
 * sıfırlaması). İlk 4 karakter GARANTİLİ olarak büyük harf, küçük harf, rakam ve
 * sembol taşır (yaygın şifre politikalarının istediği sınıflar); kalanı bu
 * sınıfların birleşiminden rastgele gelir.
 *
 * Sınıfların sabit konumda olması bilinçli bir ödündür: şifre tek kullanımlıktır
 * ve kullanıcı ilk girişte değiştirir; buna karşılık "politikayı geçmedi" hatası
 * hiç görülmez.
 */
export const generatePassword = (length = 16): string => {
  // Alt sınır 8: ilk 4 karakter sınıf garantisine ayrıldığı için daha kısası
  // gövdeye yer bırakmaz. Geçici şifre zaten ≥8 olmalı.
  const size = Math.max(length, 8);
  const prefix =
    pickChar(UPPERCASE) + pickChar(LOWERCASE) + pickChar(DIGITS) + pickChar(SYMBOLS);
  let body = "";
  for (let i = 0; i < size - 4; i++) body += pickChar(ALPHABET);
  return prefix + body;
};
