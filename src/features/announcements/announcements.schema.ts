import { z } from "zod";
import {
  optionalScheduledPublishAtLocalField,
  nullableScheduledPublishAtLocalField,
} from "../../shared/publishing/schedule.schema";

const visibilityEnum = z.enum(["university", "members"]);

export const createAnnouncementSchema = z.object({
  title: z.string().min(3, "Başlık en az 3 karakter olmalıdır.").max(256),
  content: z.string().min(1, "İçerik boş bırakılamaz.").max(5000),
  visibility: visibilityEnum.default("university"),
  pinned: z.boolean().default(false),
  publish: z.boolean().default(true),
  /** Tenant yerel saat (YYYY-MM-DDTHH:mm) — verilirse taslak + zamanlanmış yayın. */
  scheduledPublishAtLocal: optionalScheduledPublishAtLocalField,
});
export type CreateAnnouncementDTO = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z.object({
  pinned: z.boolean().optional(),
  visibility: visibilityEnum.optional(),
  scheduledPublishAtLocal: nullableScheduledPublishAtLocalField,
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateAnnouncementDTO = z.infer<typeof updateAnnouncementSchema>;

export const createUniversityAnnouncementSchema = z.object({
  title: z.string().min(3, "Başlık en az 3 karakter olmalıdır.").max(256),
  content: z.string().min(1, "İçerik boş bırakılamaz.").max(5000),
  pinned: z.boolean().default(false),
  publish: z.boolean().default(true),
  scheduledPublishAtLocal: optionalScheduledPublishAtLocalField,
});
export type CreateUniversityAnnouncementDTO = z.infer<typeof createUniversityAnnouncementSchema>;

export const updateUniversityAnnouncementSchema = z.object({
  pinned: z.boolean().optional(),
  scheduledPublishAtLocal: nullableScheduledPublishAtLocalField,
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateUniversityAnnouncementDTO = z.infer<typeof updateUniversityAnnouncementSchema>;
