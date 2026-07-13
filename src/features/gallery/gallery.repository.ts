import { db } from "../../db";
import { clubGallery } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import { CreateGalleryImagePayload } from "./gallery.types";

/**
 * Kulüp galerisi veri erişimi. Kulübe bağlı bir alt kaynak (hard-delete).
 * BaseRepository'den mekanik CRUD + composite-where helper'larını miras alır;
 * yükleyen ilişkili liste `this.query`, kulüp-kapsamlı tek kayıt `findOne` ile.
 */
class GalleryRepository extends BaseRepository<typeof clubGallery, typeof db.query.clubGallery> {
  constructor() {
    super(db, clubGallery, { query: db.query.clubGallery });
  }

  findByClub(clubId: string) {
    return this.query!.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      with: { uploader: true },
    });
  }

  /** Görseli kulüp kapsamında getirir (sahiplik/varlık kontrolü). */
  findInClub(clubId: string, imageId: string) {
    return this.findOne({ id: imageId, clubId });
  }

  add(clubId: string, uploadedBy: string, data: CreateGalleryImagePayload) {
    return this.create({
      clubId,
      uploadedBy,
      imageUrl: data.imageUrl,
      caption: data.caption,
    });
  }

  removeFromClub(clubId: string, imageId: string) {
    return this.deleteWhere({ id: imageId, clubId });
  }
}

export const galleryRepository = new GalleryRepository();
