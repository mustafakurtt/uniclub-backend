import { z } from "zod";

export const createGalleryImageSchema = z.object({
  imageUrl: z.string().url("Geçerli bir URL giriniz.").max(512),
  caption: z.string().max(256).optional(),
});
export type CreateGalleryImageDTO = z.infer<typeof createGalleryImageSchema>;
