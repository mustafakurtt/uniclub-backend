import { pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { universities } from "./university";
import { users } from "./users";
import { createdAtColumn } from "./helpers";

// ═══════════════════════════════════════════════
// MEDIA (yüklenen dosyalar — logo/kapak/galeri/avatar)
// ═══════════════════════════════════════════════
// Yüklenen her dosyanın kaydı: kim yükledi, nerede (storageKey), ne (contentType/
// boyut), ne amaçla. Dosyanın kendisi core/storage adaptöründe (disk/S3); bu tablo
// META'yı + sahipliği tutar. URL'ler storageKey'den türetilir (UPLOAD_PUBLIC_BASE_URL).
//
// Not: Mevcut *Url alanları (clubs.logoUrl, users.photoUrl, clubGallery.imageUrl...)
// hâlâ düz URL string'i taşır — upload endpoint'i bir URL üretir, o alanlara YAZILIR.
// Böylece şema/ilişki karmaşası olmadan gerçek yükleme eklenir (referans sayımı yok;
// yetim dosya temizliği ileride bir job'a bırakılır).
export const media = table("media", {
  id: t.uuid().primaryKey().defaultRandom(),
  uploaderId: t.uuid("uploader_id").references(() => users.id).notNull(),
  // Platform hesapları (universityId NULL) da yükleyebilir → nullable.
  universityId: t.uuid("university_id").references(() => universities.id),

  storageKey: t.varchar("storage_key", { length: 256 }).notNull().unique(), // "<uuid>.<ext>"
  contentType: t.varchar("content_type", { length: 100 }).notNull(),
  sizeBytes: t.integer("size_bytes").notNull(),
  // pgEnum DEĞİL (notification.type ile aynı gerekçe): yeni amaç migration istemesin.
  purpose: t.varchar({ length: 50 }).default("other").notNull(), // avatar/club_logo/club_cover/gallery/other

  ...createdAtColumn, // dosyalar değişmez → updatedAt YOK (append-only kalıbı)
}, (cols) => [
  t.index("media_uploader_created_idx").on(cols.uploaderId, cols.createdAt.desc()),
]);
