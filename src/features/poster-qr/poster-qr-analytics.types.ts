export type PosterQrScanBucket = { day: string; count: number };
export type PosterQrScanHourBucket = { hour: number; count: number };

export type PosterQrCodeAnalytics = {
  qrId: string;
  sourceLabel: string;
  targetType: "club" | "activity";
  targetClubId: string | null;
  targetActivityId: string | null;
  totalScans: number;
  byDay: PosterQrScanBucket[];
  byHour: PosterQrScanHourBucket[];
};

export type PosterQrSourceRow = {
  qrId: string;
  sourceLabel: string;
  scanCount: number;
  status: string;
};

export type PosterQrTargetSourceComparison = {
  targetType: "club" | "activity";
  targetClubId: string | null;
  targetActivityId: string | null;
  totalScans: number;
  sources: PosterQrSourceRow[];
};

export type PosterQrOverviewAnalytics = {
  timezone: string;
  targets: PosterQrTargetSourceComparison[];
};
