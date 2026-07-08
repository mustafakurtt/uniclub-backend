import { usersRepository } from "./users.repository";
import { verifyPassword, hashPassword } from "../../shared/utils/password.util";
import { toSafeUser } from "../../shared/utils/user.util";
import { getEffectivePermissions } from "../../shared/rbac/rbac.cache";
import { UpdateProfileDTO, ChangePasswordDTO } from "./users.schema";

export const usersService = {
  async getProfile(userId: string) {
    const user = await usersRepository.findProfileById(userId);
    if (!user) {
      throw new Error("Kullanıcı bulunamadı.");
    }
    return toSafeUser(user);
  },

  async updateProfile(userId: string, data: UpdateProfileDTO) {
    const updated = await usersRepository.updateProfile(userId, data);
    if (!updated) {
      throw new Error("Kullanıcı bulunamadı.");
    }
    return toSafeUser(updated);
  },

  /**
   * Mevcut şifre doğrulanmadan yeni şifre asla kabul edilmez.
   */
  async changePassword(userId: string, data: ChangePasswordDTO) {
    const user = await usersRepository.findUserById(userId);
    if (!user) {
      throw new Error("Kullanıcı bulunamadı.");
    }

    const isCurrentPasswordValid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new Error("Mevcut şifre yanlış.");
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

  /**
   * Giriş yapmış kullanıcının effective (etkin) rol ve yetkileri — UI'ın
   * göster/gizle guard'ları için tek kaynak (bkz. docs/yonetim/05 #1).
   */
  async getMyPermissions(userId: string) {
    return await getEffectivePermissions(userId);
  },
};
