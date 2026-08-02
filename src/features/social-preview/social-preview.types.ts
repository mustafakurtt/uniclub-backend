export type SocialPreviewComment = {
  authorName: string;
  body: string;
  createdAt: Date;
};

export type SocialPreviewStats = {
  commentCount: number;
  likeCount: number;
  recentComments: SocialPreviewComment[];
};

export const EMPTY_SOCIAL_PREVIEW: SocialPreviewStats = {
  commentCount: 0,
  likeCount: 0,
  recentComments: [],
};
