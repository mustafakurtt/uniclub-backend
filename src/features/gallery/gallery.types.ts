// src/features/gallery/gallery.types.ts
import { InferSelectModel } from "drizzle-orm";
import { clubGallery } from "../../db/schema";

export type ClubGalleryImage = InferSelectModel<typeof clubGallery>;

export interface CreateGalleryImagePayload {
  imageUrl: string;
  caption?: string;
}
