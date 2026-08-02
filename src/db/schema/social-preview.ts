import { pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { createdAtColumn } from "./helpers";
import { users } from "./users";
import { clubGallery } from "./clubs";
import { activities } from "./activities";
import { universities } from "./university";
import { compositeForeignKey } from "./helpers";

/**
 * DEMO SOSYAL KATMAN (salt okunur) — T2.7 gerçek yorum/beğeni özelliği geldiğinde
 * yazma uçları, moderasyon, şikâyet ve audit ile değiştirilecek veya kaldırılacak.
 * `feed.social.preview` release bayrağı kapalı tenant'larda API yanıtına gömülmez.
 */

export const gallerySocialPreviewComments = table(
  "gallery_social_preview_comments",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    universityId: t.uuid("university_id").notNull(),
    galleryImageId: t.uuid("gallery_image_id").notNull(),
    authorId: t.uuid("author_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
    body: t.text().notNull(),
    ...timestamps,
  },
  (cols) => [
    compositeForeignKey({
      columns: [cols.galleryImageId, cols.universityId],
      foreignColumns: [clubGallery.id, clubGallery.universityId],
      name: "gallery_social_preview_comments_image_tenant_fkey",
    }).onDelete("cascade"),
    t
      .index("gallery_social_preview_comments_image_idx")
      .on(cols.galleryImageId, cols.createdAt.desc()),
  ]
);

export const gallerySocialPreviewLikes = table(
  "gallery_social_preview_likes",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    universityId: t.uuid("university_id").notNull(),
    galleryImageId: t.uuid("gallery_image_id").notNull(),
    userId: t.uuid("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
    ...createdAtColumn,
  },
  (cols) => [
    compositeForeignKey({
      columns: [cols.galleryImageId, cols.universityId],
      foreignColumns: [clubGallery.id, clubGallery.universityId],
      name: "gallery_social_preview_likes_image_tenant_fkey",
    }).onDelete("cascade"),
    t.uniqueIndex("gallery_social_preview_likes_image_user_unique").on(cols.galleryImageId, cols.userId),
    t.index("gallery_social_preview_likes_image_idx").on(cols.galleryImageId),
  ]
);

/** Etkinlik tenant'ı host kulüpten türetilir; `universityId` host tenant kilidi için denormalize. */
export const activitySocialPreviewComments = table(
  "activity_social_preview_comments",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    universityId: t
      .uuid("university_id")
      .references(() => universities.id, { onDelete: "restrict" })
      .notNull(),
    activityId: t
      .uuid("activity_id")
      .references(() => activities.id, { onDelete: "cascade" })
      .notNull(),
    authorId: t.uuid("author_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
    body: t.text().notNull(),
    ...timestamps,
  },
  (cols) => [
    t.index("activity_social_preview_comments_activity_idx").on(cols.activityId, cols.createdAt.desc()),
  ]
);

export const activitySocialPreviewLikes = table(
  "activity_social_preview_likes",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    universityId: t
      .uuid("university_id")
      .references(() => universities.id, { onDelete: "restrict" })
      .notNull(),
    activityId: t
      .uuid("activity_id")
      .references(() => activities.id, { onDelete: "cascade" })
      .notNull(),
    userId: t.uuid("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
    ...createdAtColumn,
  },
  (cols) => [
    t.uniqueIndex("activity_social_preview_likes_activity_user_unique").on(cols.activityId, cols.userId),
    t.index("activity_social_preview_likes_activity_idx").on(cols.activityId),
  ]
);
