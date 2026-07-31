import { z } from "zod";

export const UNIVERSITY_STATUS_VALUES = ["trial", "active", "past_due", "suspended"] as const;

const domainField = z.string().trim().toLowerCase().min(3).max(256);

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Geçerli bir e-posta adresi giriniz.");

export const updateTenantStatusSchema = z.object({
  status: z.enum(UNIVERSITY_STATUS_VALUES),
  reason: z.string().trim().min(3).max(500),
});

export type UpdateTenantStatusDTO = z.infer<typeof updateTenantStatusSchema>;

/** Tenant yöneticisi daveti — şifre operatör tarafından belirlenmez. */
export const inviteTenantAdminSchema = z.object({
  firstName: z.string().min(2).max(100),
  lastName: z.string().min(2).max(100),
  email: emailField,
});

export type InviteTenantAdminDTO = z.infer<typeof inviteTenantAdminSchema>;

const onboardFacultySchema = z.object({
  name: z.string().min(2).max(256),
  departments: z.array(z.string().min(2).max(256)).optional().default([]),
});

export const onboardTenantSchema = z.object({
  name: z.string().min(2).max(256),
  slug: z.string().min(2).max(256),
  status: z.enum(UNIVERSITY_STATUS_VALUES).optional().default("trial"),
  domains: z
    .array(
      z.object({
        domain: domainField,
        domainType: z.enum(["student", "staff"]),
      })
    )
    .min(1, "En az bir domain girilmelidir."),
  faculties: z.array(onboardFacultySchema).optional().default([]),
  initialAdmin: inviteTenantAdminSchema.optional(),
});

export type OnboardTenantDTO = z.infer<typeof onboardTenantSchema>;
