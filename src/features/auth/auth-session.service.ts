import type { LoginDTO, ForgotPasswordDTO, ResetPasswordDTO } from "./auth.schema";
import { authRepository } from "./auth.repository";
import { hashPassword, verifyPasswordOrDummy } from "../../shared/utils/password.util"; // verifyPasswordOrDummy — timing-safe login
import { generateToken } from "../../shared/utils/jwt.util"; // JWT üreteci eklendi
import { generateOneTimeToken, hashToken } from "../../core/auth/token"; // e-posta doğrulama token'ı (JWT DEĞİL)
import { emailQueue } from "./auth.queue";
import { resolveBackgroundLocale } from "../../shared/i18n/background-locale";
import { resolveTenantStatus, tenantBlocksAccess } from "../../shared/rbac/tenant-status.cache";
import { revokeUserSessions } from "../../shared/rbac/session-revocation";
import { unauthorized, badRequest } from "../../shared/utils/errors";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

async function queuePasswordResetEmail(
  email: string,
  firstName: string,
  token: string,
  locale: string
) {
  await emailQueue.add("send-password-reset", { email, firstName, token, locale });
}

async function issuePasswordResetEmail(user: {
  id: string;
  email: string;
  firstName: string;
  universityId: string | null;
}) {
  await authRepository.invalidateUserPasswordResets(user.id);
  const resetToken = generateOneTimeToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await authRepository.createPasswordReset(user.id, await hashToken(resetToken), expiresAt);
  const locale = await resolveBackgroundLocale(user.id, user.universityId);
  await queuePasswordResetEmail(user.email, user.firstName, resetToken, locale);
}

export const authSessionService = {
  /**
   * E-posta ve şifreyi kontrol eder, başarılıysa JWT döner.
   */
  async login(data: LoginDTO) {
    const user = await authRepository.findUserByEmail(data.email);

    // Güvenlik: aynı hata mesajı + her istekte hash doğrulama (dummy hash ile timing eşitlenir).
    const isPasswordValid = await verifyPasswordOrDummy(data.password, user?.passwordHash);
    if (!user || !isPasswordValid) {
      throw unauthorized("auth.invalidCredentials");
    }

    // 3. Hesap durumu kontrolü (İsteğe bağlı koruma)
    // Anonimleştirilmiş hesap önce gelir: e-postası zaten maskelendiği için
    // buraya normalde hiç düşülmez, ama silinmiş bir hesabın "askıya alınmış"
    // diye cevaplanması yanlış olurdu — hesap yok, kimlik bilgisi geçersizdir.
    if (user.deletedAt) {
      throw unauthorized("auth.invalidCredentials");
    }
    if (user.status === "suspended") {
      throw unauthorized("auth.loginAccountSuspended");
    }

    if (user.universityId) {
      const snapshot = await resolveTenantStatus(user.universityId);
      if (tenantBlocksAccess(snapshot)) {
        throw unauthorized("auth.loginTenantSuspended");
      }
    }

    // Not: user.status === "pending" olanlar (henüz mail onaylamamış olanlar)
    // şu an sisteme giriş yapabilir, ancak ileride yazacağımız middleware (ara katman)
    // sayesinde onay yapmadan kulüplere başvuru yapmalarını engelleyeceğiz.

    // 4. JWT Üretimi (Kullanıcı ID'sini ve SaaS Tenant ID'sini içine gömüyoruz)
    const token = await generateToken({
      userId: user.id,
      universityId: user.universityId,
      tokenVersion: user.tokenVersion,
    });

    // 5. Güvenlik: Hashlenmiş şifreyi frontend'e dönme
    const { passwordHash, ...safeUser } = user;

    return {
      user: safeUser,
      token,
    };
  },

  /**
   * Self-servis şifre sıfırlama talebi. Enumeration-safe: her zaman aynı yanıt.
   * Mail yalnızca aktif, silinmemiş hesaplara gider.
   */
  async forgotPassword(data: ForgotPasswordDTO) {
    const user = await authRepository.findUserByEmail(data.email);
    if (!user || user.deletedAt || user.status !== "active") {
      return;
    }
    await issuePasswordResetEmail(user);
  },

  async resetPassword(data: ResetPasswordDTO) {
    const reset = await authRepository.findPasswordResetByTokenHash(await hashToken(data.token));
    if (!reset) {
      throw badRequest("auth.invalidPasswordResetLink");
    }
    if (reset.usedAt) {
      throw badRequest("auth.passwordResetLinkUsed");
    }
    if (reset.expiresAt < new Date()) {
      throw badRequest("auth.passwordResetLinkExpired");
    }

    const passwordHash = await hashPassword(data.password);
    const completed = await authRepository.completePasswordReset(reset.userId, reset.id, passwordHash);
    if (!completed) {
      throw badRequest("auth.passwordResetLinkUsed");
    }
    await revokeUserSessions(reset.userId);
  },
};
