import { galleryRepository } from "./gallery.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { CreateGalleryImageDTO } from "./gallery.schema";
import { notFound } from "../../shared/utils/errors";
import { galleryCache } from "./gallery.cache";

export const galleryService = {
  async listByClub(clubId: string) {
    const images = await galleryCache.list(clubId, () => galleryRepository.findByClub(clubId));
    return images
      .filter((img) => img.uploader)
      .map((img) => ({ ...img, uploader: toSafeUser(img.uploader!) }));
  },

  async addImage(clubId: string, uploadedBy: string, data: CreateGalleryImageDTO) {
    const result = await galleryRepository.add(clubId, uploadedBy, data);
    await galleryCache.invalidate(clubId);
    return result;
  },

  async removeImage(clubId: string, imageId: string) {
    const existing = await galleryRepository.findInClub(clubId, imageId);
    if (!existing) {
      throw notFound("gallery.imageNotFound");
    }
    await galleryRepository.removeFromClub(clubId, imageId);
    await galleryCache.invalidate(clubId);
  },
};
