import { galleryRepository } from "./gallery.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { CreateGalleryImageDTO } from "./gallery.schema";
import { notFound } from "../../shared/utils/errors";
import { galleryCache, galleryEffects } from "./gallery.cache";

export const galleryService = {
  async listByClub(clubId: string) {
    const images = await galleryCache.list(clubId).read(() => galleryRepository.findByClub(clubId));
    return images
      .filter((img) => img.uploader)
      .map((img) => ({ ...img, uploader: toSafeUser(img.uploader!) }));
  },

  // universityId, (club_id, university_id) bileşik FK'si için gerekiyor. Değer
  // çağırandan geliyor (duyurularla aynı kalıp); yanlış olursa DB kısıt ihlaliyle
  // reddeder — `requireClubStaff` zaten başka tenant'ın kulübüne erişimi keser.
  async addImage(
    clubId: string,
    universityId: string,
    uploadedBy: string,
    data: CreateGalleryImageDTO
  ) {
    const result = await galleryRepository.add(clubId, universityId, uploadedBy, data);
    await galleryEffects.changed.emit(clubId);
    return result;
  },

  async removeImage(clubId: string, imageId: string) {
    const existing = await galleryRepository.findInClub(clubId, imageId);
    if (!existing) {
      throw notFound("gallery.imageNotFound");
    }
    await galleryRepository.removeFromClub(clubId, imageId);
    await galleryEffects.changed.emit(clubId);
  },
};
