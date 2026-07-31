import { z } from "zod";
import { passwordSchema } from "../../shared/schemas/password.schema";

export const updateProfileSchema = z.object({
  firstName: z.string().min(2, "Ad en az 2 karakter olmalıdır.").max(100).optional(),
  lastName: z.string().min(2, "Soyad en az 2 karakter olmalıdır.").max(100).optional(),
  photoUrl: z.string().url("Geçerli bir URL giriniz.").max(512).optional(),
  preferredLanguage: z.string().length(2, "Dil kodu ISO 639-1 formatında olmalıdır (\"tr\", \"en\"...).").optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateProfileDTO = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mevcut şifre boş bırakılamaz."),
  newPassword: passwordSchema,
});
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;
