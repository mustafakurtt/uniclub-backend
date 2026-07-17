import { usersRepository } from "./users.repository";
import { verifyPassword, hashPassword } from "../../shared/utils/password.util";
import { toSafeUser } from "../../shared/utils/user.util";
import { resolveAuthz } from "../../shared/rbac/rbac.cache";
import { activitiesService } from "../activities/activities.service";
import { dashboardService } from "../dashboard/dashboard.service";
import { UpdateProfileDTO, ChangePasswordDTO } from "./users.schema";
import { notFound, badRequest } from "../../shared/utils/errors";

export const usersService = {
  async getProfile(userId: string) {
    const user = await usersRepository.findProfileById(userId);
    if (!user) {
      throw notFound("user.notFound");
    }
    return toSafeUser(user);
  },

  async updateProfile(userId: string, data: UpdateProfileDTO) {
    const updated = await usersRepository.updateProfile(userId, data);
    if (!updated) {
      throw notFound("user.notFound");
    }
    return toSafeUser(updated);
  },

  /**
   * Mevcut şifre doğrulanmadan yeni şifre asla kabul edilmez.
   */
  async changePassword(userId: string, data: ChangePasswordDTO) {
    const user = await usersRepository.findUserById(userId);
    if (!user) {
      throw notFound("user.notFound");
    }

    const isCurrentPasswordValid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw badRequest("user.currentPasswordWrong");
    }

    const newPasswordHash = await hashPassword(data.newPassword);
    await usersRepository.updatePasswordHash(userId, newPasswordHash);
  },

  async listMyClubs(userId: string) {
    return await usersRepository.findClubMembershipsByUser(userId);
  },

  async listMyApplications(userId: string) {
    return await usersRepository.findClubApplicationsByUser(userId);
  },

  async listMyAdvisedClubs(userId: string) {
    return await usersRepository.findAdvisedClubsByUser(userId);
  },

  /** Katılım bildirdiğim etkinlikler (takvimim) — activities feature'ına delege. */
  async listMyActivities(userId: string) {
    return await activitiesService.listMine(userId);
  },

  /** Öğrenci panel özeti (kulüp/etkinlik/istek sayaçları) — dashboard'a delege. */
  async getDashboard(userId: string) {
    return await dashboardService.getStudentSummary(userId);
  },

  /**
   * Giriş yapmış kullanıcının effective (etkin) rol ve yetkileri — UI'ın
   * göster/gizle guard'ları için tek kaynak (bkz. docs/yonetim/05 #1).
   */
  async getMyPermissions(userId: string) {
    return await resolveAuthz(userId);
  },
};
