import { resolveAuthz, invalidateUserPermissions } from "../../shared/rbac/rbac.cache";
import { badRequest, notFound } from "../../shared/utils/errors";
import { AuthPermission } from "./auth.permissions";
import { AdminPermission } from "../admin/admin.permissions";
import { ClubPermission } from "../clubs/clubs.permissions";
import { UniversityPermission } from "../university/university.permissions";
import { PlatformPermission } from "../platform/platform.permissions";
import { AnnouncementPermission } from "../announcements/announcements.permissions";
import { GalleryPermission } from "../gallery/gallery.permissions";
import { ActivityPermission } from "../activities/activities.permissions";
import { DashboardPermission } from "../dashboard/dashboard.permissions";
import { authRepository } from "./auth.repository";

// Kayıt otomatik rolü + promote/demote hedefi. Not: "admin" rolü kurumsal modelde
// "university_admin" olarak yeniden adlandırıldı (bkz. docs/design/06).
export const ADMIN_ROLE_NAME = "university_admin";
export const SUPER_ADMIN_ROLE_NAME = "super_admin";
export const PLATFORM_SUPPORT_ROLE_NAME = "platform_support";

/**
 * Kod tarafından guard'larda sabit referans verilen çekirdek yetki anahtarları
 * (seed kataloğu). Bunlar silinemez — silinirse ilgili endpoint'lerin yetki
 * kontrolü kalıcı olarak kırılır (bkz. docs/design/05 #5).
 */
export const SEED_PERMISSION_KEYS = new Set<string>([
  ...Object.values(AdminPermission),
  ...Object.values(ClubPermission),
  ...Object.values(UniversityPermission),
  ...Object.values(AuthPermission),
  ...Object.values(AnnouncementPermission),
  ...Object.values(GalleryPermission),
  ...Object.values(ActivityPermission),
  ...Object.values(DashboardPermission),
]);

/**
 * Kod tarafından ada göre sabit referans verilen çekirdek roller — adları
 * değiştirilemez, silinemezler (aksi halde kayıt otomatik rol ataması,
 * promote/demote ve tenant scope bypass sessizce kırılır).
 */
export const CORE_ROLE_NAMES = new Set([
  "student",
  "advisor",
  ADMIN_ROLE_NAME,
  SUPER_ADMIN_ROLE_NAME,
  PLATFORM_SUPPORT_ROLE_NAME, // tenant scope bypass'ında ada göre referans verilir
]);

/**
 * PLATFORM seviyesi roller — yalnızca super_admin atayıp/kaldırabilir. Bir tenant
 * yöneticisinin (university_admin) bu rolleri dağıtması yetki yükseltme olurdu.
 */
export const PLATFORM_ROLE_NAMES = new Set([SUPER_ADMIN_ROLE_NAME, PLATFORM_SUPPORT_ROLE_NAME]);

/**
 * PLATFORM seviyesi yetkiler — bir tenant rolüne EKLENEMEZ (tenant yöneticisi
 * kendine üniversite oluşturma/silme ya da global rol/katalog yönetimi
 * veremesin diye). Bu route'lar zaten tenantScoped DEĞİLDİR.
 */
export const PLATFORM_PERMISSION_KEYS = new Set<string>([
  UniversityPermission.CREATE,
  UniversityPermission.DELETE,
  AuthPermission.ROLE_MANAGE,
  AuthPermission.PERMISSION_MANAGE,
  PlatformPermission.TENANT_VIEW,
  PlatformPermission.TENANT_MANAGE,
  PlatformPermission.TENANT_INVITE,
  PlatformPermission.USER_VIEW,
]);

/**
 * Rol/atama işlemini yapan aktörün kapsamı. super_admin sınırsızdır; diğerleri
 * (role.manage taşıyan university_admin gibi) yalnızca KENDİ tenant'ında iş görür.
 *
 * `universityId` NULL olabilir → platform hesabı (hiçbir üniversiteye bağlı değil).
 * `maxRank` + `permissions`, "kendinden düşük rütbe" ve "sahip olmadığın yetkiyi
 * dağıtamazsın" kurallarının girdisidir (authz cache'inden gelir).
 */
export type RoleAdminActor = {
  userId: string;
  universityId: string | null;
  isSuperAdmin: boolean;
  maxRank: number;
  permissions: string[];
};

/**
 * RÜTBE KURALI (rol tarafı): aktör yalnızca KENDİ rütbesinden DÜŞÜK bir rolü
 * atayabilir/kaldırabilir/düzenleyebilir. Eşit rütbe de reddedilir — aksi halde
 * bir university_admin başka bir university_admin'i görevden alabilirdi.
 */
export function assertActorOutranksRole(actor: RoleAdminActor, role: { name: string; rank: number }) {
  if (actor.isSuperAdmin) return;
  if (role.rank >= actor.maxRank) {
    throw badRequest("auth.roleRankTooHigh", { params: { roleName: role.name } });
  }
}

/**
 * RÜTBE KURALI (kullanıcı tarafı): aktör yalnızca kendinden DÜŞÜK rütbeli bir
 * kullanıcıya dokunabilir. Hedef kullanıcının rütbesi authz cache'inden okunur.
 * Not: self (aktörün kendisi) çağıranlar tarafından ayrıca ele alınır — self'in
 * rütbesi aktöre eşit olduğu için buraya düşerse zaten reddedilir.
 */
export async function assertActorOutranksUser(actor: RoleAdminActor, targetUserId: string) {
  if (actor.isSuperAdmin) return;
  const target = await resolveAuthz(targetUserId);
  if (target.maxRank >= actor.maxRank) {
    throw badRequest("auth.userRankTooHigh");
  }
}

/** Rol üzerinde yönetim (düzenle/sil/yetki bağla) yetkisi — tenant izolasyonu + rütbe. */
export function assertRoleManageable(
  actor: RoleAdminActor,
  role: { name: string; rank: number; universityId: string | null }
) {
  if (actor.isSuperAdmin) return;
  // Global roller (universityId null) yalnızca super_admin'e aittir.
  if (role.universityId !== actor.universityId) {
    throw badRequest("auth.roleNotManageable");
  }
  assertActorOutranksRole(actor, role);
}

/**
 * Bir role eklenebilecek yetkiler. İki kapı:
 *   1. Platform seviyesi yetkiler tenant rollerine hiç atanamaz.
 *   2. Aktör, KENDİ taşımadığı bir yetkiyi hiçbir role ekleyemez — aksi halde
 *      düşük rütbeli özel bir rol üretip ona `user.manage` gibi bir yetki
 *      bağlayarak dolaylı yetki yükseltmesi (privilege escalation) yapılabilirdi.
 */
export function assertPermissionAttachable(actor: RoleAdminActor, permission: { key: string }) {
  if (actor.isSuperAdmin) return;
  if (PLATFORM_PERMISSION_KEYS.has(permission.key)) {
    throw badRequest("auth.permissionPlatformLevel");
  }
  if (!actor.permissions.includes(permission.key)) {
    throw badRequest("auth.permissionNotOwned");
  }
}

/** Kullanıcıya atanabilecek rol — platform rolleri ve başka tenant'ın rolleri hariç. */
export function assertRoleAssignable(
  actor: RoleAdminActor,
  role: { name: string; universityId: string | null }
) {
  if (actor.isSuperAdmin) return;
  if (role.universityId === null && PLATFORM_ROLE_NAMES.has(role.name)) {
    throw badRequest("auth.rolePlatformOnly");
  }
  if (role.universityId !== null && role.universityId !== actor.universityId) {
    throw badRequest("auth.roleNotInUniversity");
  }
}

/**
 * Hedef kullanıcı aktörün tenant'ında olmalı (super_admin hariç).
 * Platform hesapları (universityId: null) bir tenant yöneticisinin kapsamına girmez.
 */
export function assertUserInTenant(actor: RoleAdminActor, user: { universityId: string | null }) {
  if (actor.isSuperAdmin) return;
  if (user.universityId !== actor.universityId) {
    throw badRequest("auth.userNotManageable");
  }
}

/**
 * Kimse kendi rolünü SÖKEMEZ (super_admin dahil). Kendini yetkisiz bırakıp
 * tenant'ı/sistemi yönetimsiz kılmayı ve "dört göz" ilkesini delmeyi engeller.
 * Rol EKLEME kendine serbesttir (rütbe kuralı yükseltmeyi zaten kapatır) —
 * bir yönetici kendine "student" rolü ekleyebilir.
 */
export function assertNotSelfRoleRemoval(actor: RoleAdminActor, targetUserId: string) {
  if (actor.userId === targetUserId) {
    throw badRequest("auth.cannotRemoveOwnRole");
  }
}

/**
 * Bir yönetici rolü kaldırılmadan önce, bunun ilgili KAPSAMDAKİ son yönetici
 * olup olmadığını kontrol eder — sistemi/tenant'ı yönetimsiz bırakmayı engeller
 * (bkz. docs/design/05 #6).
 *   - super_admin  → sistemin tamamında son olan düşürülemez.
 *   - university_admin → bir üniversitenin son yöneticisi düşürülemez.
 */
export async function assertNotLastAdminOfScope(
  userId: string,
  role: { id: string; name: string; universityId: string | null },
  targetUser: { universityId: string | null }
) {
  if (role.universityId !== null) return; // tenant'a özel roller bu korumaya girmez
  const hasRole = await authRepository.userHasRole(userId, role.id);
  if (!hasRole) return; // zaten sahip değil, kaldırma no-op

  if (role.name === SUPER_ADMIN_ROLE_NAME) {
    const count = await authRepository.countUsersByRoleName(SUPER_ADMIN_ROLE_NAME);
    if (count <= 1) {
      throw badRequest("auth.lastSuperAdmin");
    }
    return;
  }

  if (role.name === ADMIN_ROLE_NAME && targetUser.universityId) {
    const count = await authRepository.countUsersByRoleNameInTenant(ADMIN_ROLE_NAME, targetUser.universityId);
    if (count <= 1) {
      throw badRequest("auth.lastUniversityAdmin");
    }
  }
}

/**
 * "admin" ve "super_admin" ataması/kaldırılması aynı mekanikte çalışır
 * (global rol, userRoles üzerinden atanır, cache invalidate edilir) —
 * tek bir yerden yönetiliyor ki iki rol arasında davranış sapması olmasın.
 */
export async function assignGlobalRole(actor: RoleAdminActor, userId: string, roleName: string) {
  const user = await authRepository.findUserById(userId);
  if (!user) {
    throw notFound("auth.userNotFound");
  }
  assertUserInTenant(actor, user);

  const role = await authRepository.findRoleByName(roleName, null);
  if (!role) {
    throw notFound("auth.globalRoleNotFound", { params: { roleName } });
  }
  // Platform rolleri (super_admin) yalnızca super_admin tarafından atanabilir;
  // aksi halde university_admin (role.manage taşır) kendine super_admin mintleyebilirdi.
  assertRoleAssignable(actor, role);
  // Kendinden yüksek/eşit rütbeli rol atanamaz (kendine atarken de geçerli).
  assertActorOutranksRole(actor, role);
  // Başkasına atıyorsa hedef de kendinden düşük rütbede olmalı.
  if (actor.userId !== userId) {
    await assertActorOutranksUser(actor, userId);
  }

  const alreadyHasRole = await authRepository.userHasRole(userId, role.id);
  if (alreadyHasRole) {
    throw badRequest("auth.userAlreadyHasRole");
  }

  await authRepository.assignRoleToUser(userId, role.id);
  await invalidateUserPermissions(userId);
}

export async function removeGlobalRole(actor: RoleAdminActor, userId: string, roleName: string) {
  const user = await authRepository.findUserById(userId);
  if (!user) {
    throw notFound("auth.userNotFound");
  }
  // Kendi rolünü sökme, super_admin için de yasaktır (dört göz ilkesi).
  assertNotSelfRoleRemoval(actor, userId);
  assertUserInTenant(actor, user);

  const role = await authRepository.findRoleByName(roleName, null);
  if (!role) {
    throw notFound("auth.globalRoleNotFound", { params: { roleName } });
  }
  assertRoleAssignable(actor, role);
  assertActorOutranksRole(actor, role);
  await assertActorOutranksUser(actor, userId);
  await assertNotLastAdminOfScope(userId, role, user);

  await authRepository.removeRoleFromUser(userId, role.id);
  await invalidateUserPermissions(userId);
}
