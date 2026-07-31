/**
 * Taşınabilir tek kullanımlık token yardımcıları — e-posta doğrulama, şifre
 * sıfırlama, davet linki gibi "üret → mail/SMS ile gönder → bir kez tüket"
 * akışları için. Config gerektirmez; core'da doğrudan durur.
 *
 * KURAL: token'ın DÜZ hali yalnızca kullanıcıya giden linkte yaşar; veritabanına
 * ÖZETİ yazılır. Token bir kimlik bilgisidir — düz saklanırsa bir DB dump'ı ya da
 * salt-okunur bir erişim, dolaşımdaki bütün linkleri kullanılabilir kılar.
 *
 * Neden bcrypt değil de SHA-256? Şifreden farklı olarak bu token'lar yüksek
 * entropili (128 bit) ve kısa ömürlüdür — kaba kuvvetle tahmin edilemezler, bu
 * yüzden yavaşlatmaya (key stretching) gerek yoktur. Ayrıca doğrulama tek bir
 * indeksli eşitlik sorgusuyla yapılabilir; bcrypt olsaydı satır satır taramak
 * gerekirdi.
 */

/**
 * Rastgele, URL'de güvenle taşınabilen tek kullanımlık token (128 bit entropi).
 * (Adı bilerek `generateToken` değil: o ad JWT üretimi için kullanılıyor,
 * ikisinin karışması güvenlik açısından tehlikeli bir yanlış anlama olurdu.)
 */
export const generateOneTimeToken = (): string => crypto.randomUUID();

/**
 * Token'ın veritabanına yazılacak SHA-256 özeti (64 karakter hex).
 * Doğrulamada gelen düz token yine bundan geçirilip eşitlik aranır.
 */
export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};
