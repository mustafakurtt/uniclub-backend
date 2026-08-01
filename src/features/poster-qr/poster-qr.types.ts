export type PosterQrTargetType = "club" | "activity";

export type CreatePosterQrPayload = {
  sourceLabel: string;
  targetType: PosterQrTargetType;
  targetClubId?: string;
  targetActivityId?: string;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

export type UpdatePosterQrPayload = {
  sourceLabel?: string;
  targetType?: PosterQrTargetType;
  targetClubId?: string | null;
  targetActivityId?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

export type PosterQrResolveStatus = "active" | "expired" | "cancelled" | "not_yet_active";

export type PosterQrActiveTarget =
  | { type: "club"; universitySlug: string; clubSlug: string }
  | { type: "activity"; universitySlug: string; activityId: string };

export type PosterQrResolveResult =
  | { status: "active"; target: PosterQrActiveTarget }
  | { status: Exclude<PosterQrResolveStatus, "active"> };
