import { z } from "zod";
import { provisionPasswordSchema } from "../../../shared/schemas/password.schema";
import { PLATFORM_ACCOUNT_ROLE_NAMES } from "./operator-users.types";

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Geçerli bir e-posta adresi giriniz.");

export const createPlatformUserSchema = z.object({
  firstName: z.string().min(2).max(100),
  lastName: z.string().min(2).max(100),
  email: emailField,
  password: provisionPasswordSchema,
  role: z.enum(PLATFORM_ACCOUNT_ROLE_NAMES),
});

export type CreatePlatformUserDTO = z.infer<typeof createPlatformUserSchema>;
