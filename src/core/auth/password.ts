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
 * Kriptografik olarak güçlü, okunabilir geçici şifre üretir (örn. admin şifre
 * sıfırlaması). Büyük/küçük harf + rakam + sembol içerir; kalanı rastgeledir.
 * Amaç tek kullanımlık geçici şifredir — kullanıcı ilk girişte değiştirir.
 */
export const generatePassword = (length = 16): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$%&*?";
  const bytes = crypto.getRandomValues(new Uint8Array(Math.max(length, 8)));
  const body = Array.from(bytes.subarray(0, length - 4), (b) => alphabet[b % alphabet.length]).join("");
  // İlk 4 karakter garantili çeşitlilik (bir çok politikanın istediği sınıflar).
  const prefix =
    alphabet[bytes[0] % 26] + // büyük
    alphabet[26 + (bytes[1] % 26)] + // küçük
    "23456789"[bytes[2] % 8] + // rakam
    symbols[bytes[3] % symbols.length]; // sembol
  return prefix + body;
};
