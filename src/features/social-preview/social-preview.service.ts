import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import {
  TenantSettingKey,
  isTenantFeatureEnabled,
} from "../tenant-settings/tenant-settings.catalog";
import { socialPreviewRepository } from "./social-preview.repository";
import type { SocialPreviewStats, SocialPreviewComment } from "./social-preview.types";
import { EMPTY_SOCIAL_PREVIEW } from "./social-preview.types";

const RECENT_COMMENT_LIMIT = 3;

type RecentRow = {
  targetId: string;
  body: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
};

function buildStatsMap(
  engagement: Array<{ targetId: string; commentCount: number; likeCount: number }>,
  recent: RecentRow[]
): Map<string, SocialPreviewStats> {
  const map = new Map<string, SocialPreviewStats>();

  for (const row of engagement) {
    map.set(row.targetId, {
      commentCount: row.commentCount,
      likeCount: row.likeCount,
      recentComments: [],
    });
  }

  for (const row of recent) {
    const stats = map.get(row.targetId) ?? { ...EMPTY_SOCIAL_PREVIEW };
    const comment: SocialPreviewComment = {
      authorName: `${row.firstName} ${row.lastName}`.trim(),
      body: row.body,
      createdAt: row.createdAt,
    };
    stats.recentComments.push(comment);
    map.set(row.targetId, stats);
  }

  return map;
}

export const socialPreviewService = {
  async isEnabled(universityId: string): Promise<boolean> {
    const settings = await getTenantSettings(universityId);
    return isTenantFeatureEnabled(settings, TenantSettingKey.FEED_SOCIAL_PREVIEW);
  },

  async loadForGalleryImages(universityId: string, imageIds: string[]): Promise<Map<string, SocialPreviewStats>> {
    const [engagement, recent] = await Promise.all([
      socialPreviewRepository.loadGalleryEngagement(universityId, imageIds),
      socialPreviewRepository.recentGalleryComments(universityId, imageIds, RECENT_COMMENT_LIMIT),
    ]);
    return buildStatsMap(engagement, recent);
  },

  async loadForActivities(universityId: string, activityIds: string[]): Promise<Map<string, SocialPreviewStats>> {
    const [engagement, recent] = await Promise.all([
      socialPreviewRepository.loadActivityEngagement(universityId, activityIds),
      socialPreviewRepository.recentActivityComments(universityId, activityIds, RECENT_COMMENT_LIMIT),
    ]);
    return buildStatsMap(engagement, recent);
  },

  attachGallerySocial<T extends { id: string }>(
    items: T[],
    statsMap: Map<string, SocialPreviewStats>
  ): Array<T & SocialPreviewStats> {
    return items.map((item) => ({
      ...item,
      ...(statsMap.get(item.id) ?? EMPTY_SOCIAL_PREVIEW),
    }));
  },

  attachActivitySocial<T extends { id: string }>(
    items: T[],
    statsMap: Map<string, SocialPreviewStats>
  ): Array<T & SocialPreviewStats> {
    return this.attachGallerySocial(items, statsMap);
  },
};
