import { moderationRepository } from "./moderation.repository";
import { ModerationAction } from "./moderation.types";
import { BanUserDTO } from "./moderation.schema";
import { notFound, badRequest } from "../../shared/utils/errors";
import { invalidateUserPermissions } from "../../shared/rbac/rbac.cache";
import { toSafeUser } from "../../shared/utils/user.util";
import { generatePassword, hashPassword } from "../../core/auth/password";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { auditService } from "../audit/audit.service";
import type { User } from "../admin/admin.types";

/**
 * Kullanıcı moderasyonu iş kuralları — ban/unban (sebepli), admin şifre sıfırlama,
 * kullanıcı aktivitesi (audit) ve moderasyon geçmişi. Kullanıcı DURUMUNU bu feature
 * sahiplenir (eski admin.updateUserStatus kaldırıldı).
 *
 * Not: durum (status) authz cache'ine gömülüdür; her değişimden sonra
 * `invalidateUserPermissions` çağrılır ki askı/geri-alma bir sonraki istekte etkili
 * olsun (bkz. docs/yonetim/05 #7). Bildirimler notifySafe ile gönderilir: bildirim
 * gidemedi diye moderasyon işlemi geri alınmaz.
 */
export const moderationService = {
  async banUser(universityId: string, userId: string, data: BanUserDTO, actorId: string) {
    const user = await moderationRepository.findUserInTenant(universityId, userId);
    if (!user) throw notFound("moderation.userNotFound");
    if (actorId === userId) throw badRequest("moderation.cannotModerateSelf");
    if (user.status === "suspended") throw badRequest("moderation.alreadyBanned");

    const updated = await moderationRepository.setStatus(userId, "suspended");
    await moderationRepository.create({
      userId,
      actorId,
      action: ModerationAction.BAN,
      reason: data.reason,
      previousStatus: user.status,
      newStatus: "suspended",
    });
    await invalidateUserPermissions(userId);

    await notificationsService.notifySafe(userId, {
      type: NotificationType.ACCOUNT_SUSPENDED,
      title: "Hesabınız askıya alındı",
      body: data.reason,
    });

    return toSafeUser(updated as User);
  },

  async unbanUser(universityId: string, userId: string, actorId: string) {
    const user = await moderationRepository.findUserInTenant(universityId, userId);
    if (!user) throw notFound("moderation.userNotFound");
    if (user.status !== "suspended") throw badRequest("moderation.notBanned");

    const updated = await moderationRepository.setStatus(userId, "active");
    await moderationRepository.create({
      userId,
      actorId,
      action: ModerationAction.UNBAN,
      reason: null,
      previousStatus: user.status,
      newStatus: "active",
    });
    await invalidateUserPermissions(userId);

    await notificationsService.notifySafe(userId, {
      type: NotificationType.ACCOUNT_UNSUSPENDED,
      title: "Hesabınızın askısı kaldırıldı",
      body: "Hesabınıza yeniden erişebilirsiniz.",
    });

    return toSafeUser(updated as User);
  },

  /**
   * Şifreyi sıfırlar: güçlü bir GEÇİCİ şifre üretir, hash'ler, kullanıcıyı sonraki
   * girişte değiştirmeye zorlar (mustChangePassword). Geçici şifre YALNIZCA burada,
   * bir kez döner — çağıran (yönetici) kullanıcıya güvenli kanaldan iletir.
   */
  async resetPassword(universityId: string, userId: string, actorId: string) {
    const user = await moderationRepository.findUserInTenant(universityId, userId);
    if (!user) throw notFound("moderation.userNotFound");

    const temporaryPassword = generatePassword();
    await moderationRepository.setPassword(userId, await hashPassword(temporaryPassword));
    await moderationRepository.create({
      userId,
      actorId,
      action: ModerationAction.PASSWORD_RESET,
      reason: null,
      previousStatus: null,
      newStatus: null,
    });

    await notificationsService.notifySafe(userId, {
      type: NotificationType.ACCOUNT_PASSWORD_RESET,
      title: "Şifreniz sıfırlandı",
      body: "Bir yönetici şifrenizi sıfırladı. Yeni geçici şifrenizle giriş yapıp değiştirin.",
    });

    return { temporaryPassword };
  },

  /** Kullanıcının denetim (audit) aktivitesi — mevcut audit altyapısını yeniden kullanır. */
  async getUserActivity(universityId: string, userId: string, limit: number, cursor?: string) {
    const user = await moderationRepository.findUserInTenant(universityId, userId);
    if (!user) throw notFound("moderation.userNotFound");
    return await auditService.list(universityId, limit, cursor, { actorId: userId });
  },

  /** Kullanıcının moderasyon geçmişi (ban/unban/şifre sıfırlama), keyset sayfalama. */
  async getModerationHistory(universityId: string, userId: string, limit: number, cursor?: string) {
    const user = await moderationRepository.findUserInTenant(universityId, userId);
    if (!user) throw notFound("moderation.userNotFound");

    const cursorDate = cursor ? new Date(cursor) : undefined;
    if (cursorDate && Number.isNaN(cursorDate.getTime())) throw badRequest("validation.failed");

    const items = await moderationRepository.listHistoryForUser(userId, limit, cursorDate);
    const nextCursor = items.length === limit ? items[items.length - 1].createdAt.toISOString() : null;
    return { items, nextCursor };
  },
};
