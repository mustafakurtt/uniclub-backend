import { mediaRepository } from "./media.repository";
import { storage } from "../../shared/storage/storage.client";
import { IMAGE_MIME_TO_EXT, sniffImageMime, type StoredObject } from "../../core/storage";
import { MEDIA_PURPOSES } from "./media.types";
import type { UploadResult } from "./media.types";
import { env } from "../../config/env";
import { badRequest, notFound, forbidden } from "../../shared/utils/errors";

// Servis edilen key formatı: "<uuid>.<ext>" — traversal/enjeksiyona karşı katı desen.
const KEY_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

/** storageKey'den servis edilebilir URL üretir (mutlak base varsa mutlak, yoksa relatif). */
function buildUrl(key: string): string {
  const base = env.UPLOAD_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";
  return `${base}/uploads/${key}`;
}

/**
 * media iş kuralları. Yükleme akışı GÜVENLİK-önce:
 *  1. boyut (bodyLimit + burada tekrar),
 *  2. gerçek tip MAGIC BYTE ile tespit (beyan edilen Content-Type'a güvenilmez; SVG yok),
 *  3. rastgele uuid key (istemci dosya adı ASLA kullanılmaz → traversal yok),
 *  4. storage'a yaz + meta satırını ekle,
 *  5. servis edilebilir URL döndür (mevcut *Url alanlarına yazılmak üzere).
 */
export const mediaService = {
  async upload(
    uploaderId: string,
    universityId: string | null,
    file: File | undefined,
    purpose: string
  ): Promise<UploadResult> {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw badRequest("media.noFile");
    }
    if (!MEDIA_PURPOSES.includes(purpose)) {
      throw badRequest("media.invalidPurpose");
    }
    if (file.size > env.MAX_UPLOAD_BYTES) {
      throw badRequest("media.tooLarge");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0) {
      throw badRequest("media.empty");
    }
    // Boyut, arrayBuffer'dan sonra kesin bilinir (file.size bazı istemcilerde yanıltıcı olabilir).
    if (bytes.length > env.MAX_UPLOAD_BYTES) {
      throw badRequest("media.tooLarge");
    }

    // Beyan edilen tipe DEĞİL, içeriğe bak.
    const mime = sniffImageMime(bytes);
    if (!mime) {
      throw badRequest("media.unsupportedType");
    }

    const key = `${crypto.randomUUID()}.${IMAGE_MIME_TO_EXT[mime]}`;
    await storage.put(key, bytes, mime);

    const row = await mediaRepository.addMedia({
      uploaderId,
      universityId,
      storageKey: key,
      contentType: mime,
      sizeBytes: bytes.length,
      purpose,
    });

    return { id: row.id, url: buildUrl(key), contentType: mime, sizeBytes: bytes.length, purpose };
  },

  /** Servis için ham nesneyi döner (public). Key formatı katı doğrulanır. */
  async getForServing(key: string): Promise<StoredObject> {
    if (!KEY_PATTERN.test(key)) {
      throw badRequest("media.invalidKey");
    }
    const obj = await storage.get(key);
    if (!obj) {
      throw notFound("media.notFound");
    }
    return obj;
  },

  /** Dosyayı siler — yalnızca YÜKLEYEN (v1; admin moderasyonu ileride ayrı yetkiyle). */
  async remove(mediaId: string, userId: string): Promise<void> {
    const row = await mediaRepository.findById(mediaId);
    if (!row) {
      throw notFound("media.notFound");
    }
    if (row.uploaderId !== userId) {
      throw forbidden("media.notFound"); // sahibi değilse varlığını bile ifşa etme
    }
    await storage.delete(row.storageKey);
    await mediaRepository.deleteById(mediaId);
  },
};
