/**
 * Şifre hash'ini istemciye asla sızdırmıyoruz — kullanıcı satırı dönen her
 * feature (auth, admin, users) bu fonksiyondan geçirmeli.
 */
export const toSafeUser = <T extends { passwordHash: string }>(user: T) => {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
};
