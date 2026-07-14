import {
  createMailer,
  sendMail as coreSendMail,
  verifyMailConnection as coreVerifyMailConnection,
} from "../../core/mail/mailer";
import { env } from "../../config/env";

/**
 * Taşınabilir mailer fabrikasının bu projeye özel kurulumu. SMTP ayarları env'den.
 *
 * Yerelde docker-compose'daki **Mailpit**'e bağlanır: gerçek mail GÖNDERMEZ,
 * hepsini yakalar ve http://localhost:8025 adresinde gösterir. Gerçek bir
 * sağlayıcıya (SES, Resend, Postmark...) geçmek için yalnızca SMTP_* env
 * değişkenlerini değiştirmek yeterlidir — bu dosya aynı kalır.
 */
export const mailer = createMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  // Yerelde Mailpit'in TLS'i yok; prod'da secure/STARTTLS devreye girer.
  ignoreTLS: env.NODE_ENV === "development",
  // Doğrulama mailleri BullMQ worker'ından art arda gider; havuz bağlantıyı
  // yeniden kullanır (her mailde SMTP el sıkışması yok).
  pool: true,
});

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** `from` bu projede sabittir (env.MAIL_FROM); çağıranlar geri kalanını verir. */
export async function sendMail(params: SendMailParams) {
  return coreSendMail(mailer, { from: env.MAIL_FROM, ...params });
}

export const verifyMailConnection = (): Promise<boolean> => coreVerifyMailConnection(mailer);
