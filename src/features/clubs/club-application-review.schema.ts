import { z } from "zod";

export const listClubApplicationsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "revision_requested"]).optional(),
});
export type ListClubApplicationsQueryDTO = z.infer<typeof listClubApplicationsQuerySchema>;

/**
 * Kulüp kurma başvurusunun REDDİ — gerekçe zorunlu. Öğrenci neyi düzelteceğini
 * bilmeden yeniden başvuramaz; gerekçesiz ret denetlenebilir bir karar değildir.
 * Gerekçe `clubApplicationApprovals.note`'a yazılır.
 */
export const rejectApplicationSchema = z.object({
  note: z.string().trim().min(10, "Ret gerekçesi en az 10 karakter olmalıdır.").max(1000),
});
export type RejectApplicationDTO = z.infer<typeof rejectApplicationSchema>;

/** Revizyon talebi — ret ile aynı gerekçe kuralı. */
export const requestRevisionApplicationSchema = z.object({
  note: z.string().trim().min(10, "Revizyon gerekçesi en az 10 karakter olmalıdır.").max(1000),
});
export type RequestRevisionApplicationDTO = z.infer<typeof requestRevisionApplicationSchema>;

/** Onayda not opsiyoneldir (bilgi amaçlı). */
export const approveApplicationSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type ApproveApplicationDTO = z.infer<typeof approveApplicationSchema>;

/** Kurul kademesi oy — ret için gerekçe zorunlu; onayda opsiyonel. */
export const committeeVoteSchema = z.object({
  vote: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
});
export type CommitteeVoteDTO = z.infer<typeof committeeVoteSchema>;

export const patchChecklistItemSchema = z.object({
  checked: z.boolean(),
  note: z.string().trim().max(500).optional(),
});
export type PatchChecklistItemDTO = z.infer<typeof patchChecklistItemSchema>;

export const reviewAppealSchema = z.object({
  decision: z.enum(["upheld", "dismissed"]),
  note: z.string().trim().min(10, "İtiraz karar gerekçesi en az 10 karakter olmalıdır.").max(2000),
});
export type ReviewAppealDTO = z.infer<typeof reviewAppealSchema>;
