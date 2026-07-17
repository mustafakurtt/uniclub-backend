import { db } from "../../db";
import { media } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import type { Media } from "./media.types";

/**
 * Media meta veri erişimi (dosyanın kendisi core/storage'da). Birincil tablo `media`
 * — BaseRepository'den mekanik CRUD + composite-where helper'larını miras alır.
 */
class MediaRepository extends BaseRepository<typeof media> {
  constructor() {
    super(db, media);
  }

  addMedia(row: {
    uploaderId: string;
    universityId: string | null;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    purpose: string;
  }): Promise<Media> {
    return this.create(row);
  }

  findByKey(storageKey: string): Promise<Media | undefined> {
    return this.findOne({ storageKey });
  }
}

export const mediaRepository = new MediaRepository();
