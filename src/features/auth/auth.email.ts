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

/** Tenant yöneticisi davet kabul linki (frontend sayfası veya doğrudan API). */
export function buildTenantAdminInvitationAcceptLink(token: string): string {
  return `${env.APP_URL}/invite/accept?token=${encodeURIComponent(token)}`;
}

/** Self-servis şifre sıfırlama linki (frontend sayfası). */
export function buildPasswordResetLink(token: string): string {
  return `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
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
  locale?: string;
}

export function buildVerificationEmail({ firstName, token, locale }: VerificationEmailParams) {
  const link = buildVerifyLink(token);
  const safeName = escapeHtml(firstName);
  const lang = locale === "en" ? "en" : "tr";

  const subject =
    lang === "en"
      ? "Campus Club System — Verify your email address"
      : "Kampüs Kulüp Sistemi — E-posta adresinizi doğrulayın";

  const text =
    lang === "en"
      ? [
          `Hello ${firstName},`,
          "",
          "Thank you for registering with the Campus Club System.",
          "Paste the following link into your browser to activate your account:",
          "",
          link,
          "",
          "This link is valid for 24 hours and can only be used once.",
          "If you did not register, you can ignore this email.",
        ].join("\n")
      : [
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
<html lang="${lang}">
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

export interface PasswordResetEmailParams {
  firstName: string;
  token: string;
  locale?: string;
}

export function buildPasswordResetEmail({ firstName, token }: PasswordResetEmailParams) {
  const link = buildPasswordResetLink(token);
  const safeName = escapeHtml(firstName);

  const subject = "Kampüs Kulüp Sistemi — Şifre sıfırlama";

  const text = [
    `Merhaba ${firstName},`,
    "",
    "Şifrenizi sıfırlamak için aşağıdaki adresi tarayıcınıza yapıştırın:",
    "",
    link,
    "",
    "Bu link 1 saat geçerlidir ve yalnızca bir kez kullanılabilir.",
    "Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
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
                  Şifrenizi sıfırlamak için aşağıdaki butona tıklayın.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td style="border-radius:8px;background-color:#2563eb;">
                      <a href="${link}"
                         style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                        Şifremi sıfırla
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
                  Bu link <strong>1 saat</strong> geçerlidir ve yalnızca bir kez kullanılabilir.<br />
                  Bu talebi siz yapmadıysanız bu e-postayı güvenle yok sayabilirsiniz.
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

export interface TenantAdminInvitationEmailParams {
  firstName: string;
  token: string;
  locale?: string;
}

export function buildTenantAdminInvitationEmail({ firstName, token }: TenantAdminInvitationEmailParams) {
  const link = buildTenantAdminInvitationAcceptLink(token);
  const safeName = escapeHtml(firstName);

  const subject = "Kampüs Kulüp Sistemi — Yönetici daveti";

  const text = [
    `Merhaba ${firstName},`,
    "",
    "Bir üniversite yönetim paneline davet edildiniz.",
    "Daveti kabul etmek ve kendi şifrenizi belirlemek için aşağıdaki adresi tarayıcınıza yapıştırın:",
    "",
    link,
    "",
    "Bu link 7 gün geçerlidir ve yalnızca bir kez kullanılabilir.",
    "Bu daveti beklemiyorsanız bu e-postayı yok sayabilirsiniz.",
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
                  Üniversite yönetim paneline davet edildiniz. Daveti kabul etmek ve
                  <strong>kendi şifrenizi</strong> belirlemek için aşağıdaki butona tıklayın.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td style="border-radius:8px;background-color:#2563eb;">
                      <a href="${link}"
                         style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                        Daveti kabul et
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
                  Bu link <strong>7 gün</strong> geçerlidir ve yalnızca bir kez kullanılabilir.<br />
                  Bu daveti beklemiyorsanız bu e-postayı güvenle yok sayabilirsiniz.
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
