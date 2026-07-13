import { db } from "../../db";
import { AuthzContext } from "../../core/rbac/rbac.types";
import "./authz"; // AuthzContext'e status/maxRank ekleyen declaration merging

/**
 * Bir kullanıcının rol tabanlı ve doğrudan (userPermissions) yetkilerini birleştirip
 * etkin (effective) rol/izin setini hesaplar.
 * Not: userPermissions ilişkisi doğrudan sorgulanır çünkü users.permissions kolaylık
 * ilişkisi, junction tablosundaki `granted` (iptal/override) kolonunu dışarı vermez.
 */
export const rbacRepository = {
  async getEffectiveRolesAndPermissions(userId: string): Promise<AuthzContext> {
    const user = await db.query.users.findFirst({
      where: { id: userId },
      with: {
        roles: {
          with: { permissions: true },
        },
        userPermissions: {
          with: { permission: true },
        },
      },
    });

    if (!user) {
      return { roles: [], permissions: [], maxRank: 0 };
    }

    const roleNames = user.roles.map((role) => role.name);
    const status = user.status;
    // Rolsüz kullanıcıda Math.max(...[]) === -Infinity olurdu; 0 tabanı bunu engeller.
    const maxRank = Math.max(0, ...user.roles.map((role) => role.rank));
    const permissionSet = new Set(
      user.roles.flatMap((role) => role.permissions.map((permission) => permission.key))
    );

    for (const userPermission of user.userPermissions) {
      if (!userPermission.permission) continue;
      if (userPermission.granted) {
        permissionSet.add(userPermission.permission.key);
      } else {
        permissionSet.delete(userPermission.permission.key);
      }
    }

    return { roles: roleNames, permissions: Array.from(permissionSet), status, maxRank };
  },
};
