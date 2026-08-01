export type ReportColumnType = "text" | "number" | "date" | "enum";

export interface ReportColumnDefinition {
  key: string;
  labelTr: string;
  labelEn: string;
  type: ReportColumnType;
  width?: number;
}

export type ReportParamType = "string" | "date" | "enum";

export interface ReportParamDefinition {
  name: string;
  type: ReportParamType;
  required?: boolean;
  labelTr: string;
  labelEn: string;
  enumValues?: string[];
}

export interface ReportDefinition {
  id: string;
  labelTr: string;
  labelEn: string;
  parameters: ReportParamDefinition[];
  columns: ReportColumnDefinition[];
}

export type ReportRow = Record<string, string | number | null>;

export interface ReportMeta {
  universityName: string;
  universitySlug: string;
  reportTitleTr: string;
  reportTitleEn: string;
  parameterSummaryTr: string;
  parameterSummaryEn: string;
  primaryColor?: string | null;
}

export interface ReportRenderer {
  readonly format: "xlsx" | "csv";
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
