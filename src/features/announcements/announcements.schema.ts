import { z } from "zod";

export const createAnnouncementSchema = z.object({
  title: z.string().min(3, "Başlık en az 3 karakter olmalıdır.").max(256),
  content: z.string().min(1, "İçerik boş bırakılamaz.").max(5000),
});
export type CreateAnnouncementDTO = z.infer<typeof createAnnouncementSchema>;
