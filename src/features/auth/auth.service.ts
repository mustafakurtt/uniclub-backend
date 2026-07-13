import { RegisterDTO, LoginDTO, CreatePermissionDTO, CreateRoleDTO, UpdateRoleDTO, UpdatePermissionDTO, SetUserPermissionDTO, ResendVerificationDTO } from "./auth.schema"; // LoginDTO'yu ekle
import { authRepository } from "./auth.repository";
import { hashPassword, verifyPassword } from "../../shared/utils/password.util"; // verifyPassword eklendi
import { generateToken } from "../../shared/utils/jwt.util"; // JWT üreteci eklendi
import { emailQueue } from "./auth.queue";
import { getEffectivePermissions, invalidateUserPermissions, invalidateUsersPermissions } from "../../shared/rbac/rbac.cache";
import { toSafeUser } from "../../shared/utils/user.util";
import { AuthPermission } from "./auth.permissions";
import { AdminPermission } from "../admin/admin.permissions";
import { ClubPermission } from "../clubs/clubs.permissions";
import { UniversityPermission } from "../university/university.permissions";
import { AnnouncementPermission } from "../announcements/announcements.permissions";
import { GalleryPermission } from "../gallery/gallery.permissions";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { notFound, badRequest, unauthorized } from "../../shared/utils/errors";
import { authCache } from "./auth.cache";

// Kayıt otomatik rolü + promote/demote hedefi. Not: "admin" rolü kurumsal modelde
// "university_admin" olarak yeniden adlandırıldı (bkz. docs/yonetim/06).
const ADMIN_ROLE_NAME = "university_admin";
const SUPER_ADMIN_ROLE_NAME = "super_admin";
const PLATFORM_SUPPORT_ROLE_NAME = "platform_support";

/**
 * Kod tarafından guard'larda sabit referans verilen çekirdek yetki anahtarları
 * (seed kataloğu). Bunlar silinemez — silinirse ilgili endpoint'lerin yetki
 * kontrolü kalıcı olarak kırılır (bkz. docs/yonetim/05 #5).
 */
const SEED_PERMISSION_KEYS = new Set<string>([
  ...Object.values(AdminPermission),
  ...Object.values(ClubPermission),
  ...Object.values(UniversityPermission),
  ...Object.values(AuthPermission),
  ...Object.values(AnnouncementPermission),
  ...Object.values(GalleryPermission),
]);

/**
 * Kod tarafından ada göre sabit referans verilen çekirdek roller — adları
 * değiştirilemez, silinemezler (aksi halde kayıt otomatik rol ataması,
 * promote/demote ve tenant scope bypass sessizce kırılır).
 */
const CORE_ROLE_NAMES = new Set([
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
const PLATFORM_ROLE_NAMES = new Set([SUPER_ADMIN_ROLE_NAME, PLATFORM_SUPPORT_ROLE_NAME]);

/**
 * PLATFORM seviyesi yetkiler — bir tenant rolüne EKLENEMEZ (tenant yöneticisi
 * kendine üniversite oluşturma/silme ya da global rol/katalog yönetimi
 * veremesin diye). Bu route'lar zaten tenantScoped DEĞİLDİR.
 */
const PLATFORM_PERMISSION_KEYS = new Set<string>([
  UniversityPermission.CREATE,
  UniversityPermission.DELETE,
  AuthPermission.ROLE_MANAGE,
  AuthPermission.PERMISSION_MANAGE,
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
function assertActorOutranksRole(actor: RoleAdminActor, role: { name: string; rank: number }) {
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
async function assertActorOutranksUser(actor: RoleAdminActor, targetUserId: string) {
  if (actor.isSuperAdmin) return;
  const target = await getEffectivePermissions(targetUserId);
  if (target.maxRank >= actor.maxRank) {
    throw badRequest("auth.userRankTooHigh");
  }
}

/** Rol üzerinde yönetim (düzenle/sil/yetki bağla) yetkisi — tenant izolasyonu + rütbe. */
function assertRoleManageable(actor: RoleAdminActor, role: { name: string; rank: number; universityId: string | null }) {
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
function assertPermissionAttachable(actor: RoleAdminActor, permission: { key: string }) {
  if (actor.isSuperAdmin) return;
  if (PLATFORM_PERMISSION_KEYS.has(permission.key)) {
    throw badRequest("auth.permissionPlatformLevel");
  }
  if (!actor.permissions.includes(permission.key)) {
    throw badRequest("auth.permissionNotOwned");
  }
}

/** Kullanıcıya atanabilecek rol — platform rolleri ve başka tenant'ın rolleri hariç. */
function assertRoleAssignable(actor: RoleAdminActor, role: { name: string; universityId: string | null }) {
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
function assertUserInTenant(actor: RoleAdminActor, user: { universityId: string | null }) {
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
function assertNotSelfRoleRemoval(actor: RoleAdminActor, targetUserId: string) {
  if (actor.userId === targetUserId) {
    throw badRequest("auth.cannotRemoveOwnRole");
  }
}

/**
 * Bir yönetici rolü kaldırılmadan önce, bunun ilgili KAPSAMDAKİ son yönetici
 * olup olmadığını kontrol eder — sistemi/tenant'ı yönetimsiz bırakmayı engeller
 * (bkz. docs/yonetim/05 #6).
 *   - super_admin  → sistemin tamamında son olan düşürülemez.
 *   - university_admin → bir üniversitenin son yöneticisi düşürülemez.
 */
async function assertNotLastAdminOfScope(
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
async function issueVerificationEmail(user: { id: string; email: string; firstName: string }) {
  await authRepository.invalidateUserEmailVerifications(user.id);

  const verificationToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  await authRepository.createEmailVerification(user.id, verificationToken, expiresAt);

  await emailQueue.add("send-verify-email", {
    email: user.email,
    firstName: user.firstName,
    token: verificationToken,
  });
}

/**
 * "admin" ve "super_admin" ataması/kaldırılması aynı mekanikte çalışır
 * (global rol, userRoles üzerinden atanır, cache invalidate edilir) —
 * tek bir yerden yönetiliyor ki iki rol arasında davranış sapması olmasın.
 */
async function assignGlobalRole(actor: RoleAdminActor, userId: string, roleName: string) {
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

async function removeGlobalRole(actor: RoleAdminActor, userId: string, roleName: string) {
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


export const authService = {
  /**
   * Yeni bir kullanıcıyı doğrulamalardan geçirerek sisteme kaydeder.
   */
  async register(data: RegisterDTO) {
    // 1. İş Kuralı: E-postadan domain'i ayıkla
    const emailParts = data.email.split("@");
    if (emailParts.length !== 2) {
      throw badRequest("auth.invalidEmailFormat");
    }
    const domain = emailParts[1];

    // 2. İş Kuralı: Domain kayıtlı mı?
    const universityDomain = await authRepository.findUniversityByDomain(domain);
    if (!universityDomain) {
      throw badRequest("auth.emailDomainNotRegistered");
    }

    // 3. İş Kuralı: E-posta müsait mi?
    const existingUser = await authRepository.findUserByEmailAndTenant(
      data.email,
      universityDomain.universityId
    );

    if (existingUser) {
      throw badRequest("auth.emailAlreadyInUse");
    }

    // 4. İş Kuralı: Şifreyi güvenlikten geçir
    const hashedPassword = await hashPassword(data.password);

    // 5. İş Kuralı: Hoca ise danışman, öğrenci ise öğrenci rolünü belirle
    const assignedRole = universityDomain.domainType === "staff" ? "advisor" : "student";

    // 6. Veritabanına Yazma İşlemi (Repository'ye devret)
    const newUser = await authRepository.createUserWithRole({
      universityId: universityDomain.universityId,
      email: data.email,
      passwordHash: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      studentNumber: data.studentNumber || null,
      status: "pending", // Mail onayı bekleniyor
    }, assignedRole);

    // 7. Doğrulama maili (token üretimi + kuyruğa atma tek yerde)
    await issueVerificationEmail(newUser);

    // 8. İş Kuralı: Hashlenmiş şifreyi dışarı sızdırma
    const { passwordHash, ...safeUser } = newUser;
    
    return safeUser;
  },


  /**
   * E-posta ve şifreyi kontrol eder, başarılıysa JWT döner.
   */
  async login(data: LoginDTO) {
    // 1. Kullanıcıyı veritabanında bul
    const user = await authRepository.findUserByEmail(data.email);
    
    // Güvenlik Kuralı: "E-posta bulunamadı" veya "Şifre yanlış" diye detay vermiyoruz ki
    // kötü niyetli kişiler sistemde hangi e-postaların kayıtlı olduğunu tahmin edemesin.
    if (!user) {
      throw unauthorized("auth.invalidCredentials");
    }

    // 2. Şifreyi doğrula (Bun.password kullanarak)
    const isPasswordValid = await verifyPassword(data.password, user.passwordHash);
    if (!isPasswordValid) {
      throw unauthorized("auth.invalidCredentials");
    }

    // 3. Hesap durumu kontrolü (İsteğe bağlı koruma)
    if (user.status === "suspended") {
      throw unauthorized("auth.loginAccountSuspended");
    }

    // Not: user.status === "pending" olanlar (henüz mail onaylamamış olanlar)
    // şu an sisteme giriş yapabilir, ancak ileride yazacağımız middleware (ara katman)
    // sayesinde onay yapmadan kulüplere başvuru yapmalarını engelleyeceğiz.

    // 4. JWT Üretimi (Kullanıcı ID'sini ve SaaS Tenant ID'sini içine gömüyoruz)
    const token = await generateToken({
      userId: user.id,
      universityId: user.universityId
    });

    // 5. Güvenlik: Hashlenmiş şifreyi frontend'e dönme
    const { passwordHash, ...safeUser } = user;
    
    return {
      user: safeUser,
      token
    };
  },

  /**
   * E-posta doğrulama linkindeki token'ı tüketir ve kullanıcıyı aktive eder.
   */
  async verifyEmail(token: string) {
    const verification = await authRepository.findEmailVerificationByToken(token);
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

    // KRİTİK: hesap durumu (status) authz cache'ine gömülüdür (EffectivePermissions.status,
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
    await authCache.invalidatePermissions();
    return created;
  },

  async listPermissions() {
    return await authCache.permissions(() => authRepository.findAllPermissions());
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
    await authCache.invalidatePermissions();
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
    await authCache.invalidatePermissions();
    // İzin bir daha roller katalogunda görünmeyecek → rol katalogu da tazelensin.
    await authCache.invalidateRoles();
  },

  /** Bir yetkiyi taşıyan roller (ters listeleme — bkz. docs/yonetim/05 #8). */
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
    await authCache.invalidateRoles();
    return created;
  },

  /**
   * super_admin tüm rolleri görür; tenant yöneticisi yalnızca global şablon
   * rolleri + kendi tenant'ının rollerini görür (başka tenant'ın özel rolleri gizli).
   */
  async listRoles(actor: RoleAdminActor) {
    // Global liste tek anahtarla cache'lenir; aktör filtresi cache DIŞINDA uygulanır.
    const roles = await authCache.roles(() => authRepository.findAllRolesWithPermissions());
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
    await authCache.invalidateRoles();
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
    await authCache.invalidateRoles();
  },

  /** Bir role sahip kullanıcılar (ters listeleme — bkz. docs/yonetim/05 #8). */
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
  // KULLANICI ROLLERİ (genel atama — bkz. docs/yonetim/05 #3)
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
  // KULLANICI BAZLI YETKİ OVERRIDE (userPermissions — bkz. docs/yonetim/05 #2)
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
    await authCache.invalidateRoles(); // rolün gömülü izin listesi değişti
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
    await authCache.invalidateRoles(); // rolün gömülü izin listesi değişti
  },
};