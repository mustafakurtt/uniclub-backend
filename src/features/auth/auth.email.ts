import { env } from "../../config/env";

/**
 * E-posta doğrulama mailinin içeriği (HTML + düz metin).
 *
 * Şablon bilinçli olarak **inline CSS + tablo** ile yazıldı: mail istemcileri
 * (Outlook, Gmail) harici stylesheet ve modern CSS'in çoğunu desteklemez.
 */

/** Token'ı, mail istemcisinin bozamayacağı şekilde linke gömer. */
export function buildVerifyLink(token: string): string {
  return `${env.APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

/** Kullanıcı adını HTML'e gömerken script enjeksiyonunu engeller. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface VerificationEmailParams {
  firstName: string;
  token: string;
}

export function buildVerificationEmail({ firstName, token }: VerificationEmailParams) {
  const link = buildVerifyLink(token);
  const safeName = escapeHtml(firstName);

  const subject = "Kampüs Kulüp Sistemi — E-posta adresinizi doğrulayın";

  const text = [
    `Merhaba ${firstName},`,
    "",
    "Kampüs Kulüp Sistemi'ne kaydolduğunuz için teşekkürler.",
    "Hesabınızı aktifleştirmek için aşağıdaki adresi tarayıcınıza yapıştırın:",
    "",
    link,
    "",
    "Bu link 24 saat geçerlidir ve yalnızca bir kez kullanılabilir.",
    "Bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e6eb;">

            <tr>
              <td style="background-color:#1f2a44;padding:24px 32px;">
                <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">Kampüs Kulüp Sistemi</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;color:#1f2a44;">Merhaba ${safeName},</p>

                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a5568;">
                  Okul e-posta adresinizle kaydolduğunuz için teşekkürler. Hesabınızı
                  aktifleştirmek ve kulüplere katılmaya başlamak için aşağıdaki butona tıklayın.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td style="border-radius:8px;background-color:#2563eb;">
                      <a href="${link}"
                         style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                        E-postamı doğrula
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 8px;font-size:13px;color:#718096;">
                  Buton çalışmıyorsa bu adresi tarayıcınıza yapıştırın:
                </p>
                <p style="margin:0 0 24px;font-size:12px;word-break:break-all;">
                  <a href="${link}" style="color:#2563eb;">${link}</a>
                </p>

                <hr style="border:none;border-top:1px solid #e4e6eb;margin:0 0 16px;" />

                <p style="margin:0;font-size:12px;line-height:1.6;color:#a0aec0;">
                  Bu link <strong>24 saat</strong> geçerlidir ve yalnızca bir kez kullanılabilir.<br />
                  Bu kaydı siz yapmadıysanız bu e-postayı güvenle yok sayabilirsiniz.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
