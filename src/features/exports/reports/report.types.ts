export type ReportColumnType = "text" | "number" | "date" | "enum";

export interface ReportColumnDefinition {
  key: string;
  labelTr: string;
  labelEn: string;
  type: ReportColumnType;
  width?: number;
}

export type ReportParamType = "string" | "date" | "enum" | "integer";

export interface ReportParamDefinition {
  name: string;
  type: ReportParamType;
  required?: boolean;
  labelTr: string;
  labelEn: string;
  enumValues?: string[];
}

export type ReportFormat = "xlsx" | "pdf";

export interface ReportDefinition {
  id: string;
  labelTr: string;
  labelEn: string;
  format: ReportFormat;
  parameters: ReportParamDefinition[];
  columns: ReportColumnDefinition[];
  /** PDF yayın bayrağı gibi ek tenant bayrağı — kapalıysa katalogda görünmez, üretim 404. */
  featureFlagKey?: string;
}

export type ReportRow = Record<string, string | number | null>;

export interface AnnualActivitySummary {
  year: number;
  clubCount: number;
  activityCount: number;
  totalParticipation: number;
}

export interface ApplicationMinutesHeader {
  proposedName: string;
  description: string | null;
  applicantName: string;
  applicantEmail: string;
  applicationStatus: string;
}

export interface GeneralMeetingMinutesBoardMember {
  fullName: string;
  titleLabel: string;
  boardType: "management" | "audit";
  seatType: "principal" | "alternate";
}

export interface GeneralMeetingMinutesMeta {
  clubName: string;
  advisorName: string | null;
  meetingTypeLabel: string;
  heldAtLabel: string;
  location: string;
  decisions: string;
  managementPrincipal: GeneralMeetingMinutesBoardMember[];
  managementAlternate: GeneralMeetingMinutesBoardMember[];
  auditPrincipal: GeneralMeetingMinutesBoardMember[];
  auditAlternate: GeneralMeetingMinutesBoardMember[];
}

export interface ReportMeta {
  universityName: string;
  universitySlug: string;
  reportTitleTr: string;
  reportTitleEn: string;
  parameterSummaryTr: string;
  parameterSummaryEn: string;
  primaryColor?: string | null;
  annualActivitySummary?: AnnualActivitySummary;
  applicationMinutes?: ApplicationMinutesHeader;
  generalMeetingMinutes?: GeneralMeetingMinutesMeta;
}

export interface ReportRenderer {
  readonly format: ReportFormat | "csv";
  readonly contentType: string;
  readonly extension: string;
  render(definition: ReportDefinition, rows: ReportRow[], meta: ReportMeta): Promise<Uint8Array>;
}

export interface RenderResult {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  usedFallback: boolean;
  fallbackReason?: string;
}
