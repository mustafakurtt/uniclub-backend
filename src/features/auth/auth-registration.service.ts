import type { RegisterDTO, ResendVerificationDTO } from "./auth.schema";
import { authRepository } from "./auth.repository";
import { hashPassword } from "../../shared/utils/password.util";
import { generateOneTimeToken, hashToken } from "../../core/auth/token";
import { emailQueue } from "./auth.queue";
import { resolveBackgroundLocale } from "../../shared/i18n/background-locale";
import { resolveTenantStatus, tenantBlocksAccess } from "../../shared/rbac/tenant-status.cache";
import { invalidateUserPermissions } from "../../shared/rbac/rbac.cache";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { badRequest } from "../../shared/utils/errors";

/** Doğrulama linkinin geçerlilik süresi. Mail şablonundaki "24 saat" ile eşleşmelidir. */
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Kullanıcıya yeni bir doğrulama token'ı üretir ve mailini kuyruğa atar.
 * Önce kullanılmamış eski token'ları geçersiz kılar → aynı anda yalnızca BİR
 * geçerli link dolaşır. Kayıt ve yeniden-gönderim akışlarının ortak adımı.
 *
 * Not: DB'de saklanan tek kullanımlık bir token (JWT değil) — `usedAt` ile
 * tüketilebilmesi gerekiyor.
 */
async function issueVerificationEmail(user: {
  id: string;
  email: string;
  firstName: string;
  universityId: string | null;
}) {
  await authRepository.invalidateUserEmailVerifications(user.id);

  // DB'ye token'ın ÖZETİ yazılır, düz hali yalnızca maildeki linkte yaşar
  // (bkz. core/auth/token.ts). Bu yüzden "token'ı hatırlatma" gibi bir akış
  // mümkün değildir; kaybolan link yeniden ÜRETİLİR, geri okunmaz.
  const verificationToken = generateOneTimeToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  await authRepository.createEmailVerification(
    user.id,
    await hashToken(verificationToken),
    expiresAt
  );

  const locale = await resolveBackgroundLocale(user.id, user.universityId);
  await emailQueue.add("send-verify-email", {
    email: user.email,
    firstName: user.firstName,
    token: verificationToken,
    locale,
  });
}

export const authRegistrationService = {
  /**
   * Öğrenci/personel self-service kayıt — e-posta doğrulama zorunlu.
   */
  async registerSelfService(data: RegisterDTO) {
    const emailParts = data.email.split("@");
    if (emailParts.length !== 2) {
      throw badRequest("auth.invalidEmailFormat");
    }
    const domain = emailParts[1];

    const universityDomain = await authRepository.findUniversityByDomain(domain);
    if (!universityDomain) {
      throw badRequest("auth.emailDomainNotRegistered");
    }

    const snapshot = await resolveTenantStatus(universityDomain.universityId);
    if (tenantBlocksAccess(snapshot)) {
      throw badRequest("auth.tenantRegistrationDisabled");
    }

    const existingUser = await authRepository.findUserByEmailAndTenant(
      data.email,
      universityDomain.universityId
    );
    if (existingUser) {
      throw badRequest("auth.emailAlreadyInUse");
    }

    const hashedPassword = await hashPassword(data.password);
    const assignedRole = universityDomain.domainType === "staff" ? "advisor" : "student";

    const user = await authRepository.runInTransaction(async (tx) => {
      return await authRepository.createUserWithRoleInTx(
        tx,
        {
          universityId: universityDomain.universityId,
          email: data.email,
          passwordHash: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          studentNumber: data.studentNumber || null,
          status: "pending",
        },
        assignedRole
      );
    });

    await issueVerificationEmail(user);

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  },

  async register(data: RegisterDTO) {
    return await authRegistrationService.registerSelfService(data);
  },

  /**
   * E-posta doğrulama linkindeki token'ı tüketir ve kullanıcıyı aktive eder.
   */
  async verifyEmail(token: string) {
    // Linkten gelen düz token aynı özetten geçirilip aranır — DB'de düz hali yok.
    const verification = await authRepository.findEmailVerificationByTokenHash(
      await hashToken(token)
    );
    if (!verification) {
      throw badRequest("auth.invalidVerificationLink");
    }

    if (verification.usedAt) {
      throw badRequest("auth.verificationLinkUsed");
    }

    if (verification.expiresAt < new Date()) {
      // Not: "tekrar kayıt olun" DEMİYORUZ — e-posta zaten kullanımda olduğu için
      // kayıt reddedilir ve kullanıcı çıkmaza girerdi. Doğru çıkış: yeniden gönderim.
      throw badRequest("auth.verificationLinkExpired");
    }

    await authRepository.markEmailVerificationUsed(verification.id);
    await authRepository.activateUser(verification.userId);

    // KRİTİK: hesap durumu (status) authz cache'ine gömülüdür (AuthzContext.status,
    // 300s TTL). Cache düşürülmezse kullanıcı doğruladıktan sonra 5 dakika daha
    // "pending" görünür — pending kısıtları uygulanmaya, arayüzdeki uyarı görünmeye
    // devam eder. (admin.updateUserStatus da aynı kalıbı uygular.)
    await invalidateUserPermissions(verification.userId);

    // Kullanıcı maili BAŞKA bir sekmede/cihazda doğrulamış olabilir; açık olan
    // oturumların "e-postanı doğrula" uyarısını anında kaldırabilmesi için push.
    await notificationsService.notifySafe(verification.userId, {
      type: NotificationType.ACCOUNT_VERIFIED,
      title: "E-posta adresiniz doğrulandı",
      body: "Hesabınız aktif. Artık kulüplere katılabilir ve başvuru yapabilirsiniz.",
    });

    return { userId: verification.userId };
  },

  /**
   * Doğrulama mailini yeniden gönderir (link süresi dolduysa ya da mail ulaşmadıysa).
   *
   * GÜVENLİK: Çağıran kim olursa olsun HER ZAMAN aynı cevap döner ve hata
   * fırlatılmaz. Aksi halde bu endpoint bir "bu e-posta kayıtlı mı?" sorgusuna
   * (user enumeration) dönüşürdü. Mail yalnızca gerçekten `pending` bir hesap
   * varsa gönderilir; `active` (zaten doğrulanmış) ve `suspended` hesaplara gönderilmez.
   */
  async resendVerification(data: ResendVerificationDTO) {
    const user = await authRepository.findUserByEmail(data.email);
    if (!user || user.status !== "pending") {
      return; // sessizce yut — dışarıdan başarılı istekten ayırt edilemez
    }
    await issueVerificationEmail(user);
  },
};
