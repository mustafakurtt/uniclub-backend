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

    // Anonimleştirilmiş (KVKK silme talebi) hesap: satır duruyor ama hesap yok
    // sayılır. Tek bir yerden kapatmak, her rotaya ayrı kontrol eklemekten
    // güvenlidir — burası `attachAuthz` ve `requireActiveUser`'ın ORTAK kaynağı,
    // dolayısıyla "suspended" dönmek zaten var olan 403 yolunu tetikler; rol ve
    // izinleri de boşaltmak, o yol bir gün gevşerse ikinci savunma olur.
    if (user.deletedAt) {
      return {
        roles: [],
        permissions: [],
        status: "suspended",
        maxRank: 0,
        universityId: user.universityId,
        tokenVersion: user.tokenVersion,
      };
    }

    const roleNames = user.roles.map((role) => role.name);
    const status = user.status;
    const universityId = user.universityId;
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

    return {
      roles: roleNames,
      permissions: Array.from(permissionSet),
      status,
      maxRank,
      universityId,
      tokenVersion: user.tokenVersion,
    };
  },
};
