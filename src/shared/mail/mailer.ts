import nodemailer from "nodemailer";
import { env } from "../../config/env";

/**
 * Tek SMTP transport'u — uygulama boyunca yeniden kullanılır (her mailde yeni
 * bağlantı açmak pahalıdır).
 *
 * Yerelde docker-compose'daki **Mailpit**'e bağlanır: gerçek mail GÖNDERMEZ,
 * hepsini yakalar ve http://localhost:8025 adresinde HTML'iyle gösterir.
 * Gerçek bir sağlayıcıya (SES, Resend, Postmark, Gmail...) geçmek için yalnızca
 * SMTP_* env değişkenlerini değiştirmek yeterlidir — bu dosya aynı kalır.
 */
export const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE, // 465 → true, 587/1025 → false (STARTTLS ya da düz)
  // Mailpit kimlik doğrulaması istemez. Kimlik verilmediyse `auth` alanını hiç
  // göndermiyoruz; aksi halde nodemailer boş kullanıcıyla AUTH denemeye çalışır.
  ...(env.SMTP_USER && env.SMTP_PASS
    ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
    : {}),
  // Yerelde Mailpit'in TLS'i yok; prod'da secure/STARTTLS devreye girer.
  ignoreTLS: env.NODE_ENV === "development",
});

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Maili gönderir. Hata FIRLATIR — çağıran (BullMQ worker) yeniden deneme
 * politikasını uygulayabilsin diye burada yutulmaz.
 */
export async function sendMail({ to, subject, html, text }: SendMailParams) {
  return await mailer.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text, // düz metin alternatifi: spam skorunu düşürür, metin okuyucular için şart
    html,
  });
}

/**
 * SMTP sunucusuna ulaşılabiliyor mu? Uygulama açılışında bilgi amaçlı çağrılır;
 * başarısız olursa uygulama ÇÖKMEZ (mail kuyruğu zaten yeniden dener).
 */
export async function verifyMailConnection(): Promise<boolean> {
  try {
    await mailer.verify();
    return true;
  } catch {
    return false;
  }
}
