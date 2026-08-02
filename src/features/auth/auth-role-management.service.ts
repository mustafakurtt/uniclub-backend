import type {
  CreatePermissionDTO,
  CreateRoleDTO,
  UpdateRoleDTO,
  UpdatePermissionDTO,
  SetUserPermissionDTO,
} from "./auth.schema";
import { authRepository } from "./auth.repository";
import { invalidateUserPermissions, invalidateUsersPermissions } from "../../shared/rbac/rbac.cache";
import { toSafeUser } from "../../shared/utils/user.util";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { badRequest, notFound } from "../../shared/utils/errors";
import { authCache, authCatalogEffects } from "./auth.cache";
import {
  ADMIN_ROLE_NAME,
  SUPER_ADMIN_ROLE_NAME,
  CORE_ROLE_NAMES,
  SEED_PERMISSION_KEYS,
  assignGlobalRole,
  removeGlobalRole,
  assertActorOutranksRole,
  assertActorOutranksUser,
  assertRoleManageable,
  assertPermissionAttachable,
  assertRoleAssignable,
  assertUserInTenant,
  assertNotSelfRoleRemoval,
  assertNotLastAdminOfScope,
  type RoleAdminActor,
} from "./auth-role-admin.policy";

export const authRoleManagementService = {
  async promoteToAdmin(actor: RoleAdminActor, userId: string) {
    await assignGlobalRole(actor, userId, ADMIN_ROLE_NAME);
  },

  async demoteFromAdmin(actor: RoleAdminActor, userId: string) {
    await removeGlobalRole(actor, userId, ADMIN_ROLE_NAME);
  },

  /**
   * super_admin ataması da aynı mekanizmayı kullanır — dikkat: bu, hedef
   * kullanıcıya TÜM sistem üzerinde tam yetki verir (tüm üniversiteler dahil).
   * Bu yüzden yalnızca super_admin çağırabilir (assertRoleAssignable).
   */
  async promoteToSuperAdmin(actor: RoleAdminActor, userId: string) {
    await assignGlobalRole(actor, userId, SUPER_ADMIN_ROLE_NAME);
  },

  async demoteFromSuperAdmin(actor: RoleAdminActor, userId: string) {
    await removeGlobalRole(actor, userId, SUPER_ADMIN_ROLE_NAME);
  },

  async createPermission(data: CreatePermissionDTO) {
    const existing = await authRepository.findPermissionByKey(data.key);
    if (existing) {
      throw badRequest("auth.permissionKeyExists");
    }
    const created = await authRepository.createPermission(data);
    await authCatalogEffects.permissionsChanged.emit();
    return created;
  },

  async listPermissions() {
    return await authCache.permissions().read(() => authRepository.findAllPermissions());
  },

  /**
   * Sadece "description" güncellenebilir — "key" kasıtlı olarak dışarıda
   * bırakıldı (bkz. auth.schema.ts'teki not).
   */
  async updatePermission(permissionId: string, data: UpdatePermissionDTO) {
    const permission = await authRepository.findPermissionById(permissionId);
    if (!permission) {
      throw notFound("auth.permissionNotFound");
    }
    const updated = await authRepository.updatePermission(permissionId, data);
    await authCatalogEffects.permissionsChanged.emit();
    return updated;
  },

  /**
   * Bir yetkiyi ve tüm bağlarını (rolePermissions + userPermissions) siler.
   * Seed kataloğundaki çekirdek yetkiler silinemez. Etkilenen kullanıcıların
   * yetki cache'i temizlenir.
   */
  async deletePermission(permissionId: string) {
    const permission = await authRepository.findPermissionById(permissionId);
    if (!permission) {
      throw notFound("auth.permissionNotFound");
    }
    if (SEED_PERMISSION_KEYS.has(permission.key)) {
      throw badRequest("auth.corePermissionCannotDelete");
    }
    const affectedUserIds = await authRepository.deletePermission(permissionId);
    await invalidateUsersPermissions(affectedUserIds);
    // Silinen izin rol katalogunda da görünüyordu → tek efekt ikisini birden düşürür.
    await authCatalogEffects.permissionDeleted.emit();
  },

  /** Bir yetkiyi taşıyan roller (ters listeleme — bkz. docs/design/05 #8). */
  async listPermissionRoles(permissionId: string) {
    const permission = await authRepository.findPermissionById(permissionId);
    if (!permission) {
      throw notFound("auth.permissionNotFound");
    }
    return await authRepository.findRolesByPermission(permissionId);
  },

  /**
   * Rol oluşturur. super_admin global (universityId: null) ya da herhangi bir
   * tenant rolü açabilir; tenant yöneticisi (university_admin) yalnızca KENDİ
   * üniversitesine ait rol açar — body'deki universityId zorla override edilir.
   *
   * Rütbe tavanı: tenant yöneticisi kendinden güçlü bir rol ÜRETEMEZ (aksi halde
   * rank 99'luk bir rol açıp kendine atayarak yükselirdi). rank verilmezse 0.
   */
  async createRole(actor: RoleAdminActor, data: CreateRoleDTO) {
    const rank = data.rank ?? 0;
    if (!actor.isSuperAdmin && rank >= actor.maxRank) {
      throw badRequest("auth.roleRankMustBeLower");
    }
    const payload = actor.isSuperAdmin
      ? { ...data, rank }
      : { ...data, rank, universityId: actor.universityId };
    const created = await authRepository.createRole(payload);
    await authCatalogEffects.rolesChanged.emit();
    return created;
  },

  /**
   * super_admin tüm rolleri görür; tenant yöneticisi yalnızca global şablon
   * rolleri + kendi tenant'ının rollerini görür (başka tenant'ın özel rolleri gizli).
   */
  async listRoles(actor: RoleAdminActor) {
    // Global liste tek anahtarla cache'lenir; aktör filtresi cache DIŞINDA uygulanır.
    const roles = await authCache.roles().read(() => authRepository.findAllRolesWithPermissions());
    if (actor.isSuperAdmin) return roles;
    return roles.filter((r) => r.universityId === null || r.universityId === actor.universityId);
  },

  async updateRole(actor: RoleAdminActor, roleId: string, data: UpdateRoleDTO) {
    const role = await authRepository.findRoleById(roleId);
    if (!role) {
      throw notFound("auth.roleNotFound");
    }
    assertRoleManageable(actor, role);
    // Çekirdek rollerin ADI değiştirilemez (kod ada sabit referans verir).
    if (CORE_ROLE_NAMES.has(role.name) && data.name && data.name !== role.name) {
      throw badRequest("auth.coreRoleNameImmutable");
    }
    // Çekirdek rollerin RÜTBESİ de değiştirilemez — hiyerarşinin temelidir.
    if (CORE_ROLE_NAMES.has(role.name) && data.rank !== undefined && data.rank !== role.rank) {
      throw badRequest("auth.coreRoleRankImmutable");
    }
    // Rütbe yükseltme, aktörün kendi seviyesinin altında kalmalı.
    if (data.rank !== undefined && !actor.isSuperAdmin && data.rank >= actor.maxRank) {
      throw badRequest("auth.roleRankCannotExceedActor");
    }
    const updated = await authRepository.updateRole(roleId, data);
    await authCatalogEffects.rolesChanged.emit();
    return updated;
  },

  /**
   * Bir rolü ve tüm bağlarını (userRoles + rolePermissions) siler.
   * Çekirdek roller silinemez. Etkilenen kullanıcıların yetki cache'i temizlenir.
   */
  async deleteRole(actor: RoleAdminActor, roleId: string) {
    const role = await authRepository.findRoleById(roleId);
    if (!role) {
      throw notFound("auth.roleNotFound");
    }
    assertRoleManageable(actor, role);
    if (CORE_ROLE_NAMES.has(role.name)) {
      throw badRequest("auth.coreRoleCannotDelete");
    }
    const affectedUserIds = await authRepository.deleteRole(roleId);
    await invalidateUsersPermissions(affectedUserIds);
    await authCatalogEffects.rolesChanged.emit();
  },

  /** Bir role sahip kullanıcılar (ters listeleme — bkz. docs/design/05 #8). */
  async listRoleUsers(actor: RoleAdminActor, roleId: string) {
    const role = await authRepository.findRoleById(roleId);
    if (!role) {
      throw notFound("auth.roleNotFound");
    }
    assertRoleManageable(actor, role);
    const users = await authRepository.findUsersByRole(roleId);
    return users.map(toSafeUser);
  },

  // ═══════════════════════════════════════════════
  // KULLANICI ROLLERİ (genel atama — bkz. docs/design/05 #3)
  // ═══════════════════════════════════════════════
  async listUserRoles(actor: RoleAdminActor, userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw notFound("auth.userNotFound");
    }
    assertUserInTenant(actor, user);
    return await authRepository.findRolesByUser(userId);
  },

  /**
   * Kullanıcıya rol atar. Tenant izolasyonu: tenant yöneticisi yalnızca kendi
   * tenant'ındaki kullanıcıya, platform-dışı global şablonları veya kendi tenant
   * rollerini atayabilir (bkz. assertRoleAssignable/assertUserInTenant).
   */
  async assignRoleToUser(actor: RoleAdminActor, userId: string, roleId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw notFound("auth.userNotFound");
    }
    assertUserInTenant(actor, user);
    const role = await authRepository.findRoleById(roleId);
    if (!role) {
      throw notFound("auth.roleNotFound");
    }
    assertRoleAssignable(actor, role);
    // Kendinden yüksek/eşit rütbeli rol atanamaz — kendine "student" eklemek serbest,
    // kendine "super_admin" mintlemek değil.
    assertActorOutranksRole(actor, role);
    if (actor.userId !== userId) {
      await assertActorOutranksUser(actor, userId);
    }
    // Tenant'a özel rol yalnızca aynı üniversitenin kullanıcısına atanabilir.
    if (role.universityId !== null && role.universityId !== user.universityId) {
      throw badRequest("auth.roleNotInUniversity");
    }
    const alreadyHasRole = await authRepository.userHasRole(userId, roleId);
    if (alreadyHasRole) {
      throw badRequest("auth.userAlreadyHasRole");
    }
    await authRepository.assignRoleToUser(userId, roleId);
    await invalidateUserPermissions(userId);

    await notificationsService.notifySafe(userId, {
      type: NotificationType.ROLE_ASSIGNED,
      title: "Yeni bir yetkiniz var",
      body: `Hesabınıza '${role.name}' rolü atandı.`,
      data: { roleId: role.id, roleName: role.name },
    });
  },

  async removeRoleFromUser(actor: RoleAdminActor, userId: string, roleId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw notFound("auth.userNotFound");
    }
    assertNotSelfRoleRemoval(actor, userId);
    assertUserInTenant(actor, user);
    const role = await authRepository.findRoleById(roleId);
    if (!role) {
      throw notFound("auth.roleNotFound");
    }
    assertRoleAssignable(actor, role);
    assertActorOutranksRole(actor, role);
    await assertActorOutranksUser(actor, userId);
    await assertNotLastAdminOfScope(userId, role, user);
    await authRepository.removeRoleFromUser(userId, roleId);
    await invalidateUserPermissions(userId);
  },

  // ═══════════════════════════════════════════════
  // KULLANICI BAZLI YETKİ OVERRIDE (userPermissions — bkz. docs/design/05 #2)
  // ═══════════════════════════════════════════════
  async listUserPermissions(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw notFound("auth.userNotFound");
    }
    return await authRepository.findUserPermissions(userId);
  },

  /**
   * Kullanıcıya kişiye özel yetki override'ı yazar (granted: true → ekle,
   * false → rolden geleni iptal et). permissionId veya key ile yetki belirtilir.
   */
  async setUserPermission(userId: string, data: SetUserPermissionDTO) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw notFound("auth.userNotFound");
    }

    let permissionId = data.permissionId;
    if (!permissionId && data.key) {
      const permission = await authRepository.findPermissionByKey(data.key);
      if (!permission) {
        throw notFound("auth.permissionNotFound");
      }
      permissionId = permission.id;
    } else if (permissionId) {
      const permission = await authRepository.findPermissionById(permissionId);
      if (!permission) {
        throw notFound("auth.permissionNotFound");
      }
    }

    const row = await authRepository.upsertUserPermission(userId, permissionId!, data.granted);
    await invalidateUserPermissions(userId);
    return row;
  },

  async removeUserPermission(userId: string, permissionId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw notFound("auth.userNotFound");
    }
    const existing = await authRepository.findUserPermission(userId, permissionId);
    if (!existing) {
      throw notFound("auth.userPermissionOverrideNotFound");
    }
    await authRepository.deleteUserPermission(userId, permissionId);
    await invalidateUserPermissions(userId);
  },

  /**
   * Bir role yetki eklendiğinde/kaldırıldığında, o role sahip TÜM kullanıcıların
   * Redis yetki cache'i invalidate edilir ki değişiklik anında etkili olsun.
   */
  async attachPermissionToRole(actor: RoleAdminActor, roleId: string, permissionId: string) {
    const role = await authRepository.findRoleById(roleId);
    if (!role) {
      throw notFound("auth.roleNotFound");
    }
    assertRoleManageable(actor, role);
    const permission = await authRepository.findPermissionById(permissionId);
    if (!permission) {
      throw notFound("auth.permissionNotFound");
    }
    assertPermissionAttachable(actor, permission);

    const existing = await authRepository.findRolePermission(roleId, permissionId);
    if (existing) {
      throw badRequest("auth.permissionAlreadyOnRole");
    }

    await authRepository.attachPermissionToRole(roleId, permissionId);
    const affectedUserIds = await authRepository.findUserIdsByRole(roleId);
    await invalidateUsersPermissions(affectedUserIds);
    await authCatalogEffects.rolesChanged.emit(); // rolün gömülü izin listesi değişti
  },

  async detachPermissionFromRole(actor: RoleAdminActor, roleId: string, permissionId: string) {
    const role = await authRepository.findRoleById(roleId);
    if (!role) {
      throw notFound("auth.roleNotFound");
    }
    assertRoleManageable(actor, role);
    const permission = await authRepository.findPermissionById(permissionId);
    if (!permission) {
      throw notFound("auth.permissionNotFound");
    }

    await authRepository.detachPermissionFromRole(roleId, permissionId);
    const affectedUserIds = await authRepository.findUserIdsByRole(roleId);
    await invalidateUsersPermissions(affectedUserIds);
    await authCatalogEffects.rolesChanged.emit(); // rolün gömülü izin listesi değişti
  },
};
