import { z } from "zod";
import { selfServicePasswordSchema, provisionPasswordSchema } from "../../shared/schemas/password.schema";

/**
 * E-posta alanı — kırpılır ve HER ZAMAN küçük harfe indirgenir.
 *
 * E-postanın yerel kısmı teknik olarak büyük/küçük harfe duyarlı olabilir ama
 * pratikte hiçbir sağlayıcı böyle davranmaz; buna karşılık `users` üzerindeki
 * tekillik index'i harfe DUYARLIDIR. Normalize edilmezse "Ali@x.edu.tr" ile
 * "ali@x.edu.tr" aynı kişi için iki ayrı hesap açar ve login denemesi yanlış
 * satıra düşer. Aynı sebeple tenant çıkarımı da (e-postadan domain ayıklama)
 * ancak küçük harfle `university_domains` ile eşleşir.
 *
 * Son savunma DB'de: `users_email_lowercase` CHECK kısıtı (bkz. db/schema.ts).
 */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Geçerli bir e-posta adresi giriniz.");

export const registerSchema = z.object({
  firstName: z.string().min(2, "Ad en az 2 karakter olmalıdır.").max(100),
  lastName: z.string().min(2, "Soyad en az 2 karakter olmalıdır.").max(100),
  email: emailField,
  studentNumber: z.string().optional(),
  password: selfServicePasswordSchema,
});

export type RegisterDTO = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Şifre boş bırakılamaz."),
});

export type LoginDTO = z.infer<typeof loginSchema>;

// Doğrulama mailini yeniden gönderme. Yanıt, hesabın var olup olmadığından
// bağımsız olarak hep aynıdır (bkz. authService.resendVerification).
export const resendVerificationSchema = z.object({
  email: emailField,
});
export type ResendVerificationDTO = z.infer<typeof resendVerificationSchema>;

export const acceptTenantAdminInvitationSchema = z.object({
  token: z.string().min(1, "Davet token'ı eksik."),
  firstName: z.string().min(2).max(100),
  lastName: z.string().min(2).max(100),
  password: provisionPasswordSchema,
});
export type AcceptTenantAdminInvitationDTO = z.infer<typeof acceptTenantAdminInvitationSchema>;

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

// Kullanıcıya genel rol atama (bkz. docs/design/05 #3)
export const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});
export type AssignRoleDTO = z.infer<typeof assignRoleSchema>;

/**
 * Kullanıcı bazlı yetki override (bkz. docs/design/05 #2).
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