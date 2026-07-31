import { z } from "zod";

/** Tüm şifre alanları (kayıt, provision, şifre değiştirme) için tek minimum uzunluk. */
export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır.`);
