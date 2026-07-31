import { z } from "zod";

export const banUserSchema = z.object({
  reason: z.string().min(3, "Ban sebebi en az 3 karakter olmalı.").max(500),
});
export type BanUserDTO = z.infer<typeof banUserSchema>;

/**
 * KVKK anonimleştirme talebi. `reason` ZORUNLU ve daha uzun bir alt sınırı var:
 * geri alınamaz bir işlem için "neden" kaydı, denetim izinin tek dayanağı
 * (talebin kendisi, talep numarası, tarih vb.). Onay kelimesi ayrıca istenir ki
 * yanlış kullanıcıya yapılan tek tıklık bir kaza mümkün olmasın.
 */
export const anonymizeUserSchema = z.object({
  reason: z.string().min(10, "Anonimleştirme gerekçesi en az 10 karakter olmalı.").max(500),
  confirm: z.literal("ANONIMLESTIR", {
    message: 'Bu işlem geri alınamaz. Onaylamak için confirm alanına "ANONIMLESTIR" yazın.',
  }),
});
export type AnonymizeUserDTO = z.infer<typeof anonymizeUserSchema>;

/** Aktivite (audit) ve moderasyon geçmişi için ortak cursor sayfalama sorgusu. */
export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ActivityQueryDTO = z.infer<typeof activityQuerySchema>;
