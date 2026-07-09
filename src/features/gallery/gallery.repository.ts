import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { CreateGalleryImagePayload } from "./gallery.types";

export const galleryRepository = {
  async findByClub(clubId: string) {
    return await db.query.clubGallery.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      with: { uploader: true },
    });
  },

  async findById(clubId: string, imageId: string) {
    return await db.query.clubGallery.findFirst({
      where: { id: imageId, clubId },
    });
  },

  async create(clubId: string, uploadedBy: string, data: CreateGalleryImagePayload) {
    const [inserted] = await db.insert(schema.clubGallery).values({
      clubId,
      uploadedBy,
      imageUrl: data.imageUrl,
      caption: data.caption,
    }).returning();
    return inserted;
  },

  async deleteById(clubId: string, imageId: string) {
    await db.delete(schema.clubGallery).where(
      and(eq(schema.clubGallery.id, imageId), eq(schema.clubGallery.clubId, clubId))
    );
  },
};
