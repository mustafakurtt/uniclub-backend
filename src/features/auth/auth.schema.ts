import { z } from "zod";

export const registerSchema = z.object({
  firstName: z.string().min(2, "Ad en az 2 karakter olmalıdır.").max(100),
  lastName: z.string().min(2, "Soyad en az 2 karakter olmalıdır.").max(100),
  email: z.string().email("Geçerli bir e-posta adresi giriniz."), 
  studentNumber: z.string().optional(),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır."),
});

export type RegisterDTO = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi giriniz."),
  password: z.string().min(1, "Şifre boş bırakılamaz."),
});

export type LoginDTO = z.infer<typeof loginSchema>;

// Doğrulama mailini yeniden gönderme. Yanıt, hesabın var olup olmadığından
// bağımsız olarak hep aynıdır (bkz. authService.resendVerification).
export const resendVerificationSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi giriniz."),
});
export type ResendVerificationDTO = z.infer<typeof resendVerificationSchema>;

export const createPermissionSchema = z.object({
  key: z.string().min(3).max(100),
  description: z.string().max(256).optional(),
});
export type CreatePermissionDTO = z.infer<typeof createPermissionSchema>;

// rank: yetki derecesi (yüksek = daha yetkili). Verilmezse 0 (en düşük).
// Bir aktör yalnızca KENDİ rütbesinden düşük rütbeli rol oluşturabilir.
export const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(256).optional(),
  universityId: z.string().uuid().nullable().optional(),
  rank: z.number().int().min(0).max(100).optional(),
});
export type CreateRoleDTO = z.infer<typeof createRoleSchema>;

export const attachPermissionSchema = z.object({
  permissionId: z.string().uuid(),
});
export type AttachPermissionDTO = z.infer<typeof attachPermissionSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(256).optional(),
  rank: z.number().int().min(0).max(100).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateRoleDTO = z.infer<typeof updateRoleSchema>;

// Not: permission "key" kasıtlı olarak güncellenemez — requirePermission(...) çağrıları
// kodda bu anahtara sabit referans verir, key değişirse mevcut yetki kontrolleri sessizce kırılır.
export const updatePermissionSchema = z.object({
  description: z.string().max(256),
});
export type UpdatePermissionDTO = z.infer<typeof updatePermissionSchema>;

// Kullanıcıya genel rol atama (bkz. docs/yonetim/05 #3)
export const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});
export type AssignRoleDTO = z.infer<typeof assignRoleSchema>;

/**
 * Kullanıcı bazlı yetki override (bkz. docs/yonetim/05 #2).
 * permissionId veya key ile yetki belirtilebilir (en az biri zorunlu);
 * granted: true → yetkiyi ekle, false → rolden geleni iptal et.
 */
export const setUserPermissionSchema = z
  .object({
    permissionId: z.string().uuid().optional(),
    key: z.string().min(3).max(100).optional(),
    granted: z.boolean(),
  })
  .refine((data) => !!data.permissionId || !!data.key, {
    message: "permissionId veya key alanlarından en az biri zorunludur.",
  });
export type SetUserPermissionDTO = z.infer<typeof setUserPermissionSchema>;