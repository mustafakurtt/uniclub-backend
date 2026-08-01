import type { ReportDefinition, ReportMeta, ReportRenderer, ReportRow } from "./report.types";

const UTF8_BOM = "\uFEFF";

function escapeCsv(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellString(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export const csvReportRenderer: ReportRenderer = {
  format: "csv",
  contentType: "text/csv; charset=utf-8",
  extension: "csv",

  async render(definition: ReportDefinition, rows: ReportRow[], meta: ReportMeta): Promise<Uint8Array> {
    const lines: string[] = [
      escapeCsv(meta.universityName),
      escapeCsv(meta.reportTitleTr),
      escapeCsv(meta.parameterSummaryTr),
      "",
      definition.columns.map((c) => escapeCsv(c.labelTr)).join(";"),
    ];

    for (const row of rows) {
      lines.push(
        definition.columns.map((col) => escapeCsv(cellString(row[col.key]))).join(";")
      );
    }

    const text = UTF8_BOM + lines.join("\r\n");
    return new TextEncoder().encode(text);
  },
};
