import { z } from "zod";

/** Self-service kayıt ve şifre değiştirme. */
export const SELF_SERVICE_PASSWORD_MIN_LENGTH = 8;

/** Operatör provizyonu (tenant admin, platform hesabı) ve bootstrap. */
export const PROVISION_PASSWORD_MIN_LENGTH = 12;

export const selfServicePasswordSchema = z
  .string()
  .min(
    SELF_SERVICE_PASSWORD_MIN_LENGTH,
    `Şifre en az ${SELF_SERVICE_PASSWORD_MIN_LENGTH} karakter olmalıdır.`
  );

export const provisionPasswordSchema = z
  .string()
  .min(
    PROVISION_PASSWORD_MIN_LENGTH,
    `Şifre en az ${PROVISION_PASSWORD_MIN_LENGTH} karakter olmalıdır.`
  );
