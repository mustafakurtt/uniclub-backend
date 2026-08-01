import { z } from "zod";
import { TENANT_SETTING_KEYS } from "./tenant-settings.catalog";

export const patchTenantSettingsSchema = z.object({
  settings: z
    .record(z.string(), z.union([z.number().int(), z.array(z.string()), z.null()]))
    .refine((obj) => Object.keys(obj).length > 0, { message: "En az bir ayar anahtarı gerekli." }),
});

export type PatchTenantSettingsDTO = z.infer<typeof patchTenantSettingsSchema>;

export const patchTenantSettingsKeys = TENANT_SETTING_KEYS;
