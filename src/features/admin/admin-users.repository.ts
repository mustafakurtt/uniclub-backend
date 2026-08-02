import { eq } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { BaseRepository } from "../../core/db";
import type { User } from "./admin-users.types";

const usersRepo = new BaseRepository(db, schema.users);

export const adminUsersRepository = {
  /**
   * Üniversitedeki kullanıcıları listeler. İsteğe bağlı `status` ve `roleName`
   * filtreleri; her satırda global rolleri (`roles`) da döner (bkz. docs/design/05 #4).
   */
  async findUsersByUniversity(universityId: string, status?: User["status"], roleName?: string) {
    let idFilter: { in: string[] } | undefined;
    if (roleName) {
      const role = await db.query.roles.findFirst({
        where: { name: roleName },
        columns: { id: true },
      });
      if (!role) return [];
      const roleUsers = await db.query.userRoles.findMany({
        where: { roleId: role.id },
        columns: { userId: true },
      });
      const ids = roleUsers.map((r) => r.userId);
      if (ids.length === 0) return [];
      idFilter = { in: ids };
    }

    return await db.query.users.findMany({
      where: {
        universityId,
        ...(status ? { status } : {}),
        ...(idFilter ? { id: idFilter } : {}),
      },
      with: {
        // `rank` dahil edilir: frontend, hedef kullanıcının en yüksek rütbesini
        // kendi `maxRank`'iyle kıyaslayıp aksiyonları önceden disable edebilsin.
        roles: { columns: { id: true, name: true, description: true, universityId: true, rank: true } },
      },
    });
  },

  async findUserInUniversity(universityId: string, userId: string): Promise<User | undefined> {
    return await usersRepo.findOne({ id: userId, universityId });
  },

  /**
   * Kullanıcıyı; global rolleri, kulüp üyelikleri (kulüp bilgisiyle) ve kişisel
   * yetki override'larıyla birlikte getirir (yönetici detay ekranı için).
   */
  async findUserInUniversityDetailed(universityId: string, userId: string) {
    return await db.query.users.findFirst({
      where: { id: userId, universityId },
      with: {
        roles: { columns: { id: true, name: true, description: true, universityId: true, rank: true } },
        clubMemberships: { with: { club: true } },
        userPermissions: { with: { permission: true } },
      },
    });
  },

  async updateUserDepartment(universityId: string, userId: string, departmentId: string | null): Promise<User | undefined> {
    const [updated] = await usersRepo.updateWhere({ id: userId, universityId }, { departmentId });
    return updated;
  },

  /**
   * departments.universityId denormalize edilmediği için (bkz. schema.ts),
   * bir bölümün gerçekten hedeflenen üniversiteye ait olduğunu doğrulamak
   * faculty zincirinden geçmeyi gerektirir.
   */
  async findDepartmentWithUniversity(departmentId: string) {
    return await db.query.departments.findFirst({
      where: { id: departmentId },
      with: { faculty: true },
    });
  },

  /** Kullanıcının belirli bir global role (örn. "advisor") sahip olup olmadığı. */
  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: { id: userId },
      with: { roles: { where: { name: roleName }, columns: { id: true } } },
    });
    return !!user && user.roles.length > 0;
  },
};
