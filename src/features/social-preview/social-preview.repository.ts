import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  gallerySocialPreviewComments,
  gallerySocialPreviewLikes,
  activitySocialPreviewComments,
  activitySocialPreviewLikes,
} from "../../db/schema";

type EngagementRow = { targetId: string; commentCount: number; likeCount: number };

type RecentCommentRow = {
  targetId: string;
  body: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
};

export const socialPreviewRepository = {
  async loadGalleryEngagement(universityId: string, imageIds: string[]): Promise<EngagementRow[]> {
    if (imageIds.length === 0) return [];

    const [commentCounts, likeCounts] = await Promise.all([
      db
        .select({
          targetId: gallerySocialPreviewComments.galleryImageId,
          commentCount: sql<number>`count(*)::int`,
        })
        .from(gallerySocialPreviewComments)
        .where(
          and(
            eq(gallerySocialPreviewComments.universityId, universityId),
            inArray(gallerySocialPreviewComments.galleryImageId, imageIds)
          )
        )
        .groupBy(gallerySocialPreviewComments.galleryImageId),
      db
        .select({
          targetId: gallerySocialPreviewLikes.galleryImageId,
          likeCount: sql<number>`count(*)::int`,
        })
        .from(gallerySocialPreviewLikes)
        .where(
          and(
            eq(gallerySocialPreviewLikes.universityId, universityId),
            inArray(gallerySocialPreviewLikes.galleryImageId, imageIds)
          )
        )
        .groupBy(gallerySocialPreviewLikes.galleryImageId),
    ]);

    const map = new Map<string, EngagementRow>();
    for (const id of imageIds) {
      map.set(id, { targetId: id, commentCount: 0, likeCount: 0 });
    }
    for (const row of commentCounts) {
      const entry = map.get(row.targetId as string)!;
      entry.commentCount = row.commentCount;
    }
    for (const row of likeCounts) {
      const entry = map.get(row.targetId as string)!;
      entry.likeCount = row.likeCount;
    }
    return [...map.values()];
  },

  async loadActivityEngagement(universityId: string, activityIds: string[]): Promise<EngagementRow[]> {
    if (activityIds.length === 0) return [];

    const [commentCounts, likeCounts] = await Promise.all([
      db
        .select({
          targetId: activitySocialPreviewComments.activityId,
          commentCount: sql<number>`count(*)::int`,
        })
        .from(activitySocialPreviewComments)
        .where(
          and(
            eq(activitySocialPreviewComments.universityId, universityId),
            inArray(activitySocialPreviewComments.activityId, activityIds)
          )
        )
        .groupBy(activitySocialPreviewComments.activityId),
      db
        .select({
          targetId: activitySocialPreviewLikes.activityId,
          likeCount: sql<number>`count(*)::int`,
        })
        .from(activitySocialPreviewLikes)
        .where(
          and(
            eq(activitySocialPreviewLikes.universityId, universityId),
            inArray(activitySocialPreviewLikes.activityId, activityIds)
          )
        )
        .groupBy(activitySocialPreviewLikes.activityId),
    ]);

    const map = new Map<string, EngagementRow>();
    for (const id of activityIds) {
      map.set(id, { targetId: id, commentCount: 0, likeCount: 0 });
    }
    for (const row of commentCounts) {
      const entry = map.get(row.targetId as string)!;
      entry.commentCount = row.commentCount;
    }
    for (const row of likeCounts) {
      const entry = map.get(row.targetId as string)!;
      entry.likeCount = row.likeCount;
    }
    return [...map.values()];
  },

  async recentGalleryComments(
    universityId: string,
    imageIds: string[],
    limitPerImage: number
  ): Promise<RecentCommentRow[]> {
    if (imageIds.length === 0) return [];

    const rows = await db.execute<{
      gallery_image_id: string;
      body: string;
      created_at: Date;
      first_name: string;
      last_name: string;
    }>(sql`
      SELECT ranked.gallery_image_id, ranked.body, ranked.created_at, u.first_name, u.last_name
      FROM (
        SELECT c.gallery_image_id, c.body, c.created_at, c.author_id,
          ROW_NUMBER() OVER (PARTITION BY c.gallery_image_id ORDER BY c.created_at DESC) AS rn
        FROM gallery_social_preview_comments c
        WHERE c.university_id = ${universityId}
          AND c.gallery_image_id IN (${sql.join(imageIds.map((id) => sql`${id}`), sql`, `)})
      ) ranked
      INNER JOIN users u ON u.id = ranked.author_id
      WHERE ranked.rn <= ${limitPerImage}
    `);

    return rows.map((row) => ({
      targetId: row.gallery_image_id,
      body: row.body,
      createdAt: row.created_at,
      firstName: row.first_name,
      lastName: row.last_name,
    }));
  },

  async recentActivityComments(
    universityId: string,
    activityIds: string[],
    limitPerTarget: number
  ): Promise<RecentCommentRow[]> {
    if (activityIds.length === 0) return [];

    const rows = await db.execute<{
      activity_id: string;
      body: string;
      created_at: Date;
      first_name: string;
      last_name: string;
    }>(sql`
      SELECT ranked.activity_id, ranked.body, ranked.created_at, u.first_name, u.last_name
      FROM (
        SELECT c.activity_id, c.body, c.created_at, c.author_id,
          ROW_NUMBER() OVER (PARTITION BY c.activity_id ORDER BY c.created_at DESC) AS rn
        FROM activity_social_preview_comments c
        WHERE c.university_id = ${universityId}
          AND c.activity_id IN (${sql.join(activityIds.map((id) => sql`${id}`), sql`, `)})
      ) ranked
      INNER JOIN users u ON u.id = ranked.author_id
      WHERE ranked.rn <= ${limitPerTarget}
    `);

    return rows.map((row) => ({
      targetId: row.activity_id,
      body: row.body,
      createdAt: row.created_at,
      firstName: row.first_name,
      lastName: row.last_name,
    }));
  },
};
