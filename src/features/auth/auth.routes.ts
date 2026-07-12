import { Hono, Context } from "hono";
import {
  registerSchema,
  loginSchema,
  createPermissionSchema,
  createRoleSchema,
  attachPermissionSchema,
  updateRoleSchema,
  updatePermissionSchema,
  assignRoleSchema,
  setUserPermissionSchema,
  resendVerificationSchema,
} from "./auth.schema";
import { authService } from "./auth.service";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { AuthPermission } from "./auth.permissions";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { badRequest } from "../../shared/utils/errors";
import { translate } from "../../shared/i18n/translator";
import type { MessageKey } from "../../shared/i18n/messages";
import {
  loginLimit,
  registerLimit,
  resendVerificationEmailLimit,
  resendVerificationIpLimit,
} from "../../middlewares/rate-limit.middleware";

// Hono rotasına RbacVariables tipini tanıtıyoruz ki 'c.get("user")'/'c.get("authz")' tamamlansın
export const authRoutes = new Hono<{ Variables: RbacVariables }>();

// Not: rotalar bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
// fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.

/**
 * Rol/atama işlemlerinin aktör kapsamı: super_admin sınırsız, diğerleri
 * (role.manage taşıyan university_admin) yalnızca kendi tenant'ında iş görür.
 * guard(ROLE_MANAGE) attachAuthz'ı çalıştırdığı için authz burada mevcuttur.
 *
 * userId + maxRank + permissions, "kendi rolünü sökemezsin", "kendinden düşük
 * rütbe" ve "sahip olmadığın yetkiyi dağıtamazsın" kurallarını besler.
 */
const actorFromCtx = (c: Context<{ Variables: RbacVariables }>) => {
  const user = c.get("user");
  const authz = c.get("authz");
  return {
    userId: user.userId,
    universityId: user.universityId,
    isSuperAdmin: authz.roles.includes("super_admin"),
    maxRank: authz.maxRank,
    permissions: authz.permissions,
  };
};

/**
 * login response'u zarfın DIŞINDA `user`/`token` de döner (bkz. docs/API.md
 * "tek istisna") — core responder (`ok`) bu şekle uymaz, bu yüzden `translate`
 * burada doğrudan çağrılır. Mesaj yine aynı katalogdan gelen bir anahtardır.
 */
const t = (c: Context, key: MessageKey, params?: Record<string, unknown>) =>
  translate(key, (c.get("locale") as string | undefined) ?? "", params);

// 1. KAYIT OLMA (IP başına cömert limit — kampüs NAT'ı ortak IP kullanır)
authRoutes.post("/register", registerLimit, validate("json", registerSchema), async (c) => {
  const body = c.req.valid("json");
  const user = await authService.register(body);
  return created(c, user, "auth.registerSuccess");
});

// 2. GİRİŞ YAPMA (hesap başına limit — brute-force'a karşı; IP limiti YOK, kampüs kilitlenirdi)
authRoutes.post("/login", loginLimit, validate("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await authService.login(body);
  return c.json({
    success: true,
    message: t(c, "auth.loginSuccess"),
    user: result.user,
    token: result.token,
  });
});

// 3. E-POSTA DOĞRULAMA
authRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    throw badRequest("auth.verificationTokenMissing");
  }
  await authService.verifyEmail(token);
  return done(c, "auth.emailVerified");
});

// 3B. DOĞRULAMA MAİLİNİ YENİDEN GÖNDERME
// Link süresi dolduysa veya mail ulaşmadıysa kullanılır. Hesabın varlığını
// sızdırmamak için cevap HER ZAMAN aynıdır (200 + aynı mesaj).
// Limitler: e-posta başına 3/saat (asıl koruma — hedefin gelen kutusu),
// IP başına 30/saat (yalnızca kaba sel koruması).
authRoutes.post(
  "/resend-verification",
  resendVerificationEmailLimit,
  resendVerificationIpLimit,
  validate("json", resendVerificationSchema),
  async (c) => {
    const body = c.req.valid("json");
    await authService.resendVerification(body);
    return done(c, "auth.resendVerificationSent");
  }
);

// 4. PROFİL BİLGİSİ (Korumalı Rota)
authRoutes.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return ok(c, { userId: user.userId, universityId: user.universityId }, "auth.meProtected");
});

// 5. KULLANICIYI YÖNETİCİ (ADMIN) YAPMA
authRoutes.patch("/users/:userId/promote-admin", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { userId } = c.req.param();
  await authService.promoteToAdmin(actorFromCtx(c), userId);
  return done(c, "auth.promotedToAdmin");
});

// 6. KULLANICININ YÖNETİCİLİĞİNİ KALDIRMA
authRoutes.patch("/users/:userId/demote-admin", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { userId } = c.req.param();
  await authService.demoteFromAdmin(actorFromCtx(c), userId);
  return done(c, "auth.demotedFromAdmin");
});

// 6B. KULLANICIYI SİSTEM YÖNETİCİSİ (SUPER_ADMIN) YAPMA
authRoutes.patch("/users/:userId/promote-super-admin", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { userId } = c.req.param();
  await authService.promoteToSuperAdmin(actorFromCtx(c), userId);
  return done(c, "auth.promotedToSuperAdmin");
});

// 6C. KULLANICININ SİSTEM YÖNETİCİLİĞİNİ KALDIRMA
authRoutes.patch("/users/:userId/demote-super-admin", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { userId } = c.req.param();
  await authService.demoteFromSuperAdmin(actorFromCtx(c), userId);
  return done(c, "auth.demotedFromSuperAdmin");
});

// 7. YETKİ (PERMISSION) OLUŞTURMA
authRoutes.post(
  "/permissions",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  validate("json", createPermissionSchema),
  async (c) => {
    const body = c.req.valid("json");
    const permission = await authService.createPermission(body);
    return created(c, permission, "auth.permissionCreated");
  }
);

// 8. YETKİLERİ LİSTELEME
authRoutes.get("/permissions", ...guard(AuthPermission.PERMISSION_MANAGE), async (c) => {
  const permissions = await authService.listPermissions();
  return ok(c, permissions, "auth.permissionsListed");
});

// 8B. YETKİ AÇIKLAMASINI GÜNCELLEME (key kasıtlı olarak değiştirilemez)
authRoutes.patch(
  "/permissions/:permissionId",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  validate("json", updatePermissionSchema),
  async (c) => {
    const { permissionId } = c.req.param();
    const body = c.req.valid("json");
    const permission = await authService.updatePermission(permissionId, body);
    return ok(c, permission, "auth.permissionUpdated");
  }
);

// 9. ROL OLUŞTURMA
authRoutes.post(
  "/roles",
  ...guard(AuthPermission.ROLE_MANAGE),
  validate("json", createRoleSchema),
  async (c) => {
    const body = c.req.valid("json");
    const role = await authService.createRole(actorFromCtx(c), body);
    return created(c, role, "auth.roleCreated");
  }
);

// 10. ROLLERİ LİSTELEME
authRoutes.get("/roles", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const roles = await authService.listRoles(actorFromCtx(c));
  return ok(c, roles, "auth.rolesListed");
});

// 10B. ROL BİLGİLERİNİ GÜNCELLEME
authRoutes.patch(
  "/roles/:roleId",
  ...guard(AuthPermission.ROLE_MANAGE),
  validate("json", updateRoleSchema),
  async (c) => {
    const { roleId } = c.req.param();
    const body = c.req.valid("json");
    const role = await authService.updateRole(actorFromCtx(c), roleId, body);
    return ok(c, role, "auth.roleUpdated");
  }
);

// 11. ROLE YETKİ EKLEME
authRoutes.post(
  "/roles/:roleId/permissions",
  ...guard(AuthPermission.ROLE_MANAGE),
  validate("json", attachPermissionSchema),
  async (c) => {
    const { roleId } = c.req.param();
    const { permissionId } = c.req.valid("json");
    await authService.attachPermissionToRole(actorFromCtx(c), roleId, permissionId);
    return created(c, undefined, "auth.permissionAttachedToRole");
  }
);

// 12. ROLDEN YETKİ KALDIRMA
authRoutes.delete(
  "/roles/:roleId/permissions/:permissionId",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { roleId, permissionId } = c.req.param();
    await authService.detachPermissionFromRole(actorFromCtx(c), roleId, permissionId);
    return done(c, "auth.permissionDetachedFromRole");
  }
);

// 13. ROL SİLME (çekirdek roller silinemez; userRoles + rolePermissions temizlenir)
authRoutes.delete("/roles/:roleId", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { roleId } = c.req.param();
  await authService.deleteRole(actorFromCtx(c), roleId);
  return done(c, "auth.roleDeleted");
});

// 14. BİR ROLE SAHİP KULLANICILAR (ters listeleme)
authRoutes.get("/roles/:roleId/users", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { roleId } = c.req.param();
  const users = await authService.listRoleUsers(actorFromCtx(c), roleId);
  return ok(c, users, "auth.roleUsersListed");
});

// 15. YETKİ SİLME (seed çekirdek yetkileri silinemez; rolePermissions + userPermissions temizlenir)
authRoutes.delete("/permissions/:permissionId", ...guard(AuthPermission.PERMISSION_MANAGE), async (c) => {
  const { permissionId } = c.req.param();
  await authService.deletePermission(permissionId);
  return done(c, "auth.permissionDeleted");
});

// 16. BİR YETKİYİ TAŞIYAN ROLLER (ters listeleme)
authRoutes.get("/permissions/:permissionId/roles", ...guard(AuthPermission.PERMISSION_MANAGE), async (c) => {
  const { permissionId } = c.req.param();
  const roles = await authService.listPermissionRoles(permissionId);
  return ok(c, roles, "auth.permissionRolesListed");
});

// ═══════════════════════════════════════════════
// KULLANICI ROLLERİ — genel atama (bkz. docs/yonetim/05 #3)
// ═══════════════════════════════════════════════

// 17. KULLANICININ ROLLERİNİ LİSTELEME
authRoutes.get("/users/:userId/roles", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { userId } = c.req.param();
  const roles = await authService.listUserRoles(actorFromCtx(c), userId);
  return ok(c, roles, "auth.userRolesListed");
});

// 18. KULLANICIYA ROL ATAMA (herhangi bir rol — advisor / özel roller dahil)
authRoutes.post(
  "/users/:userId/roles",
  ...guard(AuthPermission.ROLE_MANAGE),
  validate("json", assignRoleSchema),
  async (c) => {
    const { userId } = c.req.param();
    const { roleId } = c.req.valid("json");
    await authService.assignRoleToUser(actorFromCtx(c), userId, roleId);
    return created(c, undefined, "auth.roleAssignedToUser");
  }
);

// 19. KULLANICIDAN ROL KALDIRMA
authRoutes.delete("/users/:userId/roles/:roleId", ...guard(AuthPermission.ROLE_MANAGE), async (c) => {
  const { userId, roleId } = c.req.param();
  await authService.removeRoleFromUser(actorFromCtx(c), userId, roleId);
  return done(c, "auth.roleRemovedFromUser");
});

// ═══════════════════════════════════════════════
// KULLANICI BAZLI YETKİ OVERRIDE (bkz. docs/yonetim/05 #2)
// ═══════════════════════════════════════════════

// 20. KULLANICININ KİŞİSEL YETKİ OVERRIDE'LARINI LİSTELEME
authRoutes.get("/users/:userId/permissions", ...guard(AuthPermission.PERMISSION_MANAGE), async (c) => {
  const { userId } = c.req.param();
  const permissions = await authService.listUserPermissions(userId);
  return ok(c, permissions, "auth.userPermissionsListed");
});

// 21. KULLANICIYA KİŞİSEL YETKİ VER/İPTAL ET (granted: true=ekle, false=rolden geleni iptal et)
authRoutes.post(
  "/users/:userId/permissions",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  validate("json", setUserPermissionSchema),
  async (c) => {
    const { userId } = c.req.param();
    const body = c.req.valid("json");
    const result = await authService.setUserPermission(userId, body);
    return created(c, result, "auth.userPermissionUpdated");
  }
);

// 22. KULLANICININ KİŞİSEL YETKİ OVERRIDE'INI KALDIRMA (yetki tekrar role göre belirlenir)
authRoutes.delete("/users/:userId/permissions/:permissionId", ...guard(AuthPermission.PERMISSION_MANAGE), async (c) => {
  const { userId, permissionId } = c.req.param();
  await authService.removeUserPermission(userId, permissionId);
  return done(c, "auth.userPermissionRemoved");
});
