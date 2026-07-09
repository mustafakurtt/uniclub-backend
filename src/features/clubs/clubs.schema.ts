import { z } from "zod";

export const createApplicationSchema = z.object({
  proposedName: z.string().min(3, "Kulüp adı en az 3 karakter olmalıdır.").max(256),
  description: z.string().max(2000).optional(),
});
export type CreateApplicationDTO = z.infer<typeof createApplicationSchema>;

export const decideJoinRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});
export type DecideJoinRequestDTO = z.infer<typeof decideJoinRequestSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(["member", "officer"]),
});
export type UpdateMemberRoleDTO = z.infer<typeof updateMemberRoleSchema>;

// Başkanlık devri: yeni başkanın kullanıcı id'si (kulübün onaylı bir üyesi olmalı).
export const transferPresidencySchema = z.object({
  newPresidentId: z.string().uuid("Geçerli bir kullanıcı id'si giriniz."),
});
export type TransferPresidencyDTO = z.infer<typeof transferPresidencySchema>;

const contactPlatformEnum = z.enum([
  "whatsapp", "instagram", "discord", "telegram", "twitter", "website", "email", "other",
]);

export const createContactLinkSchema = z.object({
  platform: contactPlatformEnum,
  url: z.string().url("Geçerli bir URL giriniz.").max(512),
});
export type CreateContactLinkDTO = z.infer<typeof createContactLinkSchema>;

// İletişim linki güncelleme — platform sabittir (o platformun linkini düzenlersin),
// yalnızca URL değişir. Platformu değiştirmek istersen sil + yeniden ekle.
export const updateContactLinkSchema = z.object({
  url: z.string().url("Geçerli bir URL giriniz.").max(512),
});
export type UpdateContactLinkDTO = z.infer<typeof updateContactLinkSchema>;

// Başkanın kendi kulübünü düzenlemesi. Durum (status) BU rotadan değiştirilemez —
// kulübü onaylama/arşivleme okul yöneticisinin işidir (bkz. admin: club.update).
export const updateOwnClubSchema = z.object({
  name: z.string().min(3, "Kulüp adı en az 3 karakter olmalıdır.").max(256).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url("Geçerli bir URL giriniz.").max(512).optional(),
  coverUrl: z.string().url("Geçerli bir URL giriniz.").max(512).optional(),
  joinPolicy: z.enum(["open", "approval_required"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Güncellenecek en az bir alan girilmelidir.",
});
export type UpdateOwnClubDTO = z.infer<typeof updateOwnClubSchema>;

// GET /api/clubs?search=&status= — status yalnızca approved kulüplerle sınırlıdır
// (public listede sadece approved dönebildiği için pratikte tek değerli).
export const listClubsQuerySchema = z.object({
  search: z.string().min(1).max(256).optional(),
});
export type ListClubsQueryDTO = z.infer<typeof listClubsQuerySchema>;
