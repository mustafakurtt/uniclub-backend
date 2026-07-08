import { Hono, Context } from "hono";
import { zValidator } from "@hono/zod-validator";
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
import { respondWithBusinessError } from "../../shared/utils/error.util";
import {
  loginLimit,
  registerLimit,
  resendVerificationEmailLimit,
  resendVerificationIpLimit,
} from "../../middlewares/rate-limit.middleware";

// Hono rotasına RbacVariables tipini tanıtıyoruz ki 'c.get("user")'/'c.get("authz")' tamamlansın
export const authRoutes = new Hono<{ Variables: RbacVariables }>();

const statusFromError = (message: string) => (message.includes("bulunamadı") ? 404 : 400);

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

// 1. KAYIT OLMA (IP başına cömert limit — kampüs NAT'ı ortak IP kullanır)
authRoutes.post("/register", registerLimit, zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");
  try {
    const user = await authService.register(body);
    return c.json({
      success: true,
      message: "Kayıt başarılı. Lütfen okul mailinize gelen onay linkine tıklayın.",
      data: user 
    }, 201);
  } catch (error) {
    return respondWithBusinessError(c, error);
  }
});

// 2. GİRİŞ YAPMA (hesap başına limit — brute-force'a karşı; IP limiti YOK, kampüs kilitlenirdi)
authRoutes.post("/login", loginLimit, zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  try {
    const result = await authService.login(body);
    return c.json({
      success: true,
      message: "Giriş başarılı.",
      user: result.user,
      token: result.token 
    });
  } catch (error) {
    // Giriş reddi her zaman 401 (yanlış e-posta/şifre ayrımı yapılmaz).
    return respondWithBusinessError(c, error, () => 401);
  }
});

// 3. E-POSTA DOĞRULAMA
authRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.json({ success: false, message: "Doğrulama token'ı eksik." }, 400);
  }
  try {
    await authService.verifyEmail(token);
    return c.json({ success: true, message: "E-posta adresiniz doğrulandı, hesabınız aktif." });
  } catch (error) {
    return respondWithBusinessError(c, error);
  }
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
  zValidator("json", resendVerificationSchema),
  async (c) => {
    const body = c.req.valid("json");
    await authService.resendVerification(body);
    return c.json({
      success: true,
      message: "Eğer bu e-posta adresine ait doğrulanmamış bir hesap varsa, doğrulama maili gönderildi.",
    });
  }
);

// 4. PROFİL BİLGİSİ (Korumalı Rota)
authRoutes.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return c.json({
    success: true,
    message: "Korumalı alana hoş geldiniz!",
    data: {
      userId: user.userId,
      universityId: user.universityId,
    }
  });
});

// 5. KULLANICIYI YÖNETİCİ (ADMIN) YAPMA
authRoutes.patch(
  "/users/:userId/promote-admin",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { userId } = c.req.param();
    try {
      await authService.promoteToAdmin(actorFromCtx(c), userId);
      return c.json({ success: true, message: "Kullanıcı yönetici yapıldı." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 6. KULLANICININ YÖNETİCİLİĞİNİ KALDIRMA
authRoutes.patch(
  "/users/:userId/demote-admin",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { userId } = c.req.param();
    try {
      await authService.demoteFromAdmin(actorFromCtx(c), userId);
      return c.json({ success: true, message: "Kullanıcının yöneticiliği kaldırıldı." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 6B. KULLANICIYI SİSTEM YÖNETİCİSİ (SUPER_ADMIN) YAPMA
authRoutes.patch(
  "/users/:userId/promote-super-admin",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { userId } = c.req.param();
    try {
      await authService.promoteToSuperAdmin(actorFromCtx(c), userId);
      return c.json({ success: true, message: "Kullanıcı sistem yöneticisi yapıldı." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 6C. KULLANICININ SİSTEM YÖNETİCİLİĞİNİ KALDIRMA
authRoutes.patch(
  "/users/:userId/demote-super-admin",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { userId } = c.req.param();
    try {
      await authService.demoteFromSuperAdmin(actorFromCtx(c), userId);
      return c.json({ success: true, message: "Kullanıcının sistem yöneticiliği kaldırıldı." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 7. YETKİ (PERMISSION) OLUŞTURMA
authRoutes.post(
  "/permissions",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  zValidator("json", createPermissionSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const permission = await authService.createPermission(body);
      return c.json({ success: true, message: "Yetki oluşturuldu.", data: permission }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 8. YETKİLERİ LİSTELEME
authRoutes.get(
  "/permissions",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  async (c) => {
    const permissions = await authService.listPermissions();
    return c.json({ success: true, message: "Yetkiler listelendi.", data: permissions });
  }
);

// 8B. YETKİ AÇIKLAMASINI GÜNCELLEME (key kasıtlı olarak değiştirilemez)
authRoutes.patch(
  "/permissions/:permissionId",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  zValidator("json", updatePermissionSchema),
  async (c) => {
    const { permissionId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const permission = await authService.updatePermission(permissionId, body);
      return c.json({ success: true, message: "Yetki güncellendi.", data: permission });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 9. ROL OLUŞTURMA
authRoutes.post(
  "/roles",
  ...guard(AuthPermission.ROLE_MANAGE),
  zValidator("json", createRoleSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const role = await authService.createRole(actorFromCtx(c), body);
      return c.json({ success: true, message: "Rol oluşturuldu.", data: role }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 10. ROLLERİ LİSTELEME
authRoutes.get(
  "/roles",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const roles = await authService.listRoles(actorFromCtx(c));
    return c.json({ success: true, message: "Roller listelendi.", data: roles });
  }
);

// 10B. ROL BİLGİLERİNİ GÜNCELLEME
authRoutes.patch(
  "/roles/:roleId",
  ...guard(AuthPermission.ROLE_MANAGE),
  zValidator("json", updateRoleSchema),
  async (c) => {
    const { roleId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const role = await authService.updateRole(actorFromCtx(c), roleId, body);
      return c.json({ success: true, message: "Rol güncellendi.", data: role });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 11. ROLE YETKİ EKLEME
authRoutes.post(
  "/roles/:roleId/permissions",
  ...guard(AuthPermission.ROLE_MANAGE),
  zValidator("json", attachPermissionSchema),
  async (c) => {
    const { roleId } = c.req.param();
    const { permissionId } = c.req.valid("json");
    try {
      await authService.attachPermissionToRole(actorFromCtx(c), roleId, permissionId);
      return c.json({ success: true, message: "Yetki role eklendi." }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 12. ROLDEN YETKİ KALDIRMA
authRoutes.delete(
  "/roles/:roleId/permissions/:permissionId",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { roleId, permissionId } = c.req.param();
    try {
      await authService.detachPermissionFromRole(actorFromCtx(c), roleId, permissionId);
      return c.json({ success: true, message: "Yetki rolden kaldırıldı." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 13. ROL SİLME (çekirdek roller silinemez; userRoles + rolePermissions temizlenir)
authRoutes.delete(
  "/roles/:roleId",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { roleId } = c.req.param();
    try {
      await authService.deleteRole(actorFromCtx(c), roleId);
      return c.json({ success: true, message: "Rol silindi." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 14. BİR ROLE SAHİP KULLANICILAR (ters listeleme)
authRoutes.get(
  "/roles/:roleId/users",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { roleId } = c.req.param();
    try {
      const users = await authService.listRoleUsers(actorFromCtx(c), roleId);
      return c.json({ success: true, message: "Role sahip kullanıcılar listelendi.", data: users });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 15. YETKİ SİLME (seed çekirdek yetkileri silinemez; rolePermissions + userPermissions temizlenir)
authRoutes.delete(
  "/permissions/:permissionId",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  async (c) => {
    const { permissionId } = c.req.param();
    try {
      await authService.deletePermission(permissionId);
      return c.json({ success: true, message: "Yetki silindi." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 16. BİR YETKİYİ TAŞIYAN ROLLER (ters listeleme)
authRoutes.get(
  "/permissions/:permissionId/roles",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  async (c) => {
    const { permissionId } = c.req.param();
    try {
      const roles = await authService.listPermissionRoles(permissionId);
      return c.json({ success: true, message: "Yetkiyi taşıyan roller listelendi.", data: roles });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// ═══════════════════════════════════════════════
// KULLANICI ROLLERİ — genel atama (bkz. docs/yonetim/05 #3)
// ═══════════════════════════════════════════════

// 17. KULLANICININ ROLLERİNİ LİSTELEME
authRoutes.get(
  "/users/:userId/roles",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { userId } = c.req.param();
    try {
      const roles = await authService.listUserRoles(actorFromCtx(c), userId);
      return c.json({ success: true, message: "Kullanıcının rolleri listelendi.", data: roles });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 18. KULLANICIYA ROL ATAMA (herhangi bir rol — advisor / özel roller dahil)
authRoutes.post(
  "/users/:userId/roles",
  ...guard(AuthPermission.ROLE_MANAGE),
  zValidator("json", assignRoleSchema),
  async (c) => {
    const { userId } = c.req.param();
    const { roleId } = c.req.valid("json");
    try {
      await authService.assignRoleToUser(actorFromCtx(c), userId, roleId);
      return c.json({ success: true, message: "Rol kullanıcıya atandı." }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 19. KULLANICIDAN ROL KALDIRMA
authRoutes.delete(
  "/users/:userId/roles/:roleId",
  ...guard(AuthPermission.ROLE_MANAGE),
  async (c) => {
    const { userId, roleId } = c.req.param();
    try {
      await authService.removeRoleFromUser(actorFromCtx(c), userId, roleId);
      return c.json({ success: true, message: "Rol kullanıcıdan kaldırıldı." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// ═══════════════════════════════════════════════
// KULLANICI BAZLI YETKİ OVERRIDE (bkz. docs/yonetim/05 #2)
// ═══════════════════════════════════════════════

// 20. KULLANICININ KİŞİSEL YETKİ OVERRIDE'LARINI LİSTELEME
authRoutes.get(
  "/users/:userId/permissions",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  async (c) => {
    const { userId } = c.req.param();
    try {
      const permissions = await authService.listUserPermissions(userId);
      return c.json({ success: true, message: "Kullanıcının yetki override'ları listelendi.", data: permissions });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 21. KULLANICIYA KİŞİSEL YETKİ VER/İPTAL ET (granted: true=ekle, false=rolden geleni iptal et)
authRoutes.post(
  "/users/:userId/permissions",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  zValidator("json", setUserPermissionSchema),
  async (c) => {
    const { userId } = c.req.param();
    const body = c.req.valid("json");
    try {
      const result = await authService.setUserPermission(userId, body);
      return c.json({ success: true, message: "Kullanıcı yetkisi güncellendi.", data: result }, 201);
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);

// 22. KULLANICININ KİŞİSEL YETKİ OVERRIDE'INI KALDIRMA (yetki tekrar role göre belirlenir)
authRoutes.delete(
  "/users/:userId/permissions/:permissionId",
  ...guard(AuthPermission.PERMISSION_MANAGE),
  async (c) => {
    const { userId, permissionId } = c.req.param();
    try {
      await authService.removeUserPermission(userId, permissionId);
      return c.json({ success: true, message: "Kullanıcı yetki override'ı kaldırıldı." });
    } catch (error) {
      return respondWithBusinessError(c, error, statusFromError);
    }
  }
);