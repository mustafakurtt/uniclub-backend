import { adminUsersRepository } from "./admin-users.repository";
import { UpdateUserDepartmentDTO } from "./admin-users.schema";
import type { User } from "./admin-users.types";
import { toSafeUser } from "../../shared/utils/user.util";
import { resolveAuthz } from "../../shared/rbac/rbac.cache";
import { notFound, badRequest } from "../../shared/utils/errors";

export const adminUsersService = {
  async listUsers(universityId: string, status?: "pending" | "active" | "suspended", roleName?: string) {
    const users = await adminUsersRepository.findUsersByUniversity(universityId, status, roleName);
    return users.map(toSafeUser);
  },

  /**
   * Kullanıcıyı; rolleri, kulüp üyelikleri ve effective (etkin) yetkileriyle
   * birlikte döner. Kişisel yetki override'ları `permissionOverrides` altında.
   */
  async getUser(universityId: string, userId: string) {
    const user = await adminUsersRepository.findUserInUniversityDetailed(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }
    const { roles, clubMemberships, userPermissions, ...rest } = user;
    const effective = await resolveAuthz(userId);
    return {
      ...toSafeUser(rest as unknown as User),
      roles,
      clubMemberships,
      permissionOverrides: userPermissions,
      effectivePermissions: effective.permissions,
    };
  },

  /** Kullanıcının effective (roller + kişisel override uygulanmış) yetkileri. */
  async getUserEffectivePermissions(universityId: string, userId: string) {
    const user = await adminUsersRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }
    return await resolveAuthz(userId);
  },

  /**
   * Hedef bölümün gerçekten bu üniversiteye ait olduğunu doğrular
   * (departments.universityId denormalize edilmediği için faculty zincirinden kontrol edilir).
   */
  async updateUserDepartment(universityId: string, userId: string, data: UpdateUserDepartmentDTO) {
    const user = await adminUsersRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }

    if (data.departmentId !== null) {
      const department = await adminUsersRepository.findDepartmentWithUniversity(data.departmentId);
      if (!department || !department.faculty || department.faculty.universityId !== universityId) {
        throw badRequest("admin.departmentNotInUniversity");
      }
    }

    const updated = await adminUsersRepository.updateUserDepartment(universityId, userId, data.departmentId);
    return toSafeUser(updated as User);
  },
};
