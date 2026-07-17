import { z } from "zod";

/**
 * activities feature'ının zod istek şemaları + türetilmiş DTO tipleri (aynı diğer
 * `*.schema.ts` konvansiyonu). Tarihler `z.coerce.date()` ile ISO string'ten
 * Date'e çevrilir; iş kuralı doğrulamaları (geçmiş tarih, bitiş<başlangıç) burada
 * DEĞİL serviste yapılır (Türkçe/i18n mesajla), şema yalnızca biçim doğrular.
 */

// Yayınlanınca üyelere görünürlük: tenant geneli mi (keşif) yoksa yalnızca üyeler mi.
const visibilityEnum = z.enum(["university", "members"]);

// RSVP niyeti — "waitlist" kullanıcı tarafından seçilmez (kontenjan dolunca sistem
// atar, v1'de reddedilir), o yüzden burada yalnızca going/interested kabul edilir.
const rsvpIntentEnum = z.enum(["going", "interested"]);

export const createActivitySchema = z.object({
  title: z.string().min(3, "Başlık en az 3 karakter olmalıdır.").max(256),
  description: z.string().max(5000).optional(),
  location: z.string().max(512).optional(),
  coverUrl: z.string().url("Geçerli bir URL giriniz.").max(512).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  capacity: z.number().int().positive("Kontenjan pozitif bir tam sayı olmalıdır.").optional(),
  visibility: visibilityEnum.default("university"),
  // true (varsayılan) → anında yayınla + üyelere bildir; false → taslak kaydet
  // (yalnızca kulüp staff görür, sonra POST .../publish ile yayınlanır).
  publish: z.boolean().default(true),
});
export type CreateActivityDTO = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z.object({
  title: z.string().min(3, "Başlık en az 3 karakter olmalıdır.").max(256).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().max(512).optional(),
  coverUrl: z.string().url("Geçerli bir URL giriniz.").max(512).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  capacity: z.number().int().positive("Kontenjan pozitif bir tam sayı olmalıdır.").optional(),
  visibility: visibilityEnum.optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateActivityDTO = z.infer<typeof updateActivitySchema>;

export const rsvpSchema = z.object({
  status: rsvpIntentEnum.default("going"),
});
export type RsvpDTO = z.infer<typeof rsvpSchema>;

// Co-host daveti: davet edilecek kulübün id'si (aynı ya da farklı üniversiteden).
export const inviteCoHostSchema = z.object({
  clubId: z.string().uuid("Geçerli bir kulüp id'si giriniz."),
});
export type InviteCoHostDTO = z.infer<typeof inviteCoHostSchema>;

// GET /api/activities?scope=upcoming&search=... — keşif akışı filtresi.
export const listActivitiesQuerySchema = z.object({
  scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  search: z.string().min(1).max(256).optional(),
});
export type ListActivitiesQueryDTO = z.infer<typeof listActivitiesQuerySchema>;
