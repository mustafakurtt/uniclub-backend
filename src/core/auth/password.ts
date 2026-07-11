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
