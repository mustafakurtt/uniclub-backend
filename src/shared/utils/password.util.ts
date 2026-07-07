/**
 * Düz metin şifreyi (plain text) alır ve güvenli bir hash'e çevirir.
 */
export const hashPassword = async (password: string): Promise<string> => {
  // Bun.password varsayılan olarak bcrypt kullanır (Cost factor 10)
  return await Bun.password.hash(password);
};

/**
 * Kullanıcının girdiği şifre ile veritabanındaki hash'i karşılaştırır.
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await Bun.password.verify(password, hash);
};