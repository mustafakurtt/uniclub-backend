import { z } from "zod";
import { CONTACT_PLATFORMS } from "./clubs.types";
import { APPLICATION_REQUIRED_DOCUMENT_KEY_PATTERN } from "./application-required-documents.core";

const applicationDocumentRefSchema = z.object({
  documentTypeKey: z
    .string()
    .regex(APPLICATION_REQUIRED_DOCUMENT_KEY_PATTERN, "Geçersiz belge türü anahtarı."),
  mediaId: z.string().uuid("Geçerli bir dosya kimliği giriniz."),
});

export const createApplicationSchema = z.object({
  proposedName: z.string().min(3, "Kulüp adı en az 3 karakter olmalıdır.").max(256),
  description: z.string().max(2000).optional(),
  documents: z.array(applicationDocumentRefSchema).max(30).optional(),
});
export type CreateApplicationDTO = z.infer<typeof createApplicationSchema>;

export const upsertApplicationDocumentSchema = z.object({
  mediaId: z.string().uuid("Geçerli bir dosya kimliği giriniz."),
});
export type UpsertApplicationDocumentDTO = z.infer<typeof upsertApplicationDocumentSchema>;

/** Revizyon sonrası yeniden gönderim — alanlar başvuru oluşturma ile aynı. */
export const resubmitApplicationSchema = createApplicationSchema;
export type ResubmitApplicationDTO = z.infer<typeof resubmitApplicationSchema>;

export const submitAppealSchema = z.object({
  note: z.string().trim().min(10, "İtiraz gerekçesi en az 10 karakter olmalıdır.").max(2000),
});
export type SubmitAppealDTO = z.infer<typeof submitAppealSchema>;

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

// Katalog tek yerde: clubs.types.ts → CONTACT_PLATFORMS. Buradan türetilir ki
// yeni bir platform eklendiğinde zod şeması ile tip birbirinden sapmasın.
const contactPlatformEnum = z.enum(CONTACT_PLATFORMS);

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
