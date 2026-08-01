import ExcelJS from "exceljs";
import { EXPORT_XLSX_EPOCH_MS } from "../exports.constants";
import type { ReportDefinition, ReportMeta, ReportRenderer, ReportRow } from "./report.types";

const FIXED_EPOCH = new Date(EXPORT_XLSX_EPOCH_MS);

function formatCellValue(value: string | number | null, type: string): string | number {
  if (value === null || value === undefined) return "";
  if (type === "date" && typeof value === "string") {
    return value;
  }
  return value;
}

function parseArgb(hex?: string | null): string | undefined {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return undefined;
  return `FF${hex.slice(1).toUpperCase()}`;
}

export const xlsxReportRenderer: ReportRenderer = {
  format: "xlsx",
  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  extension: "xlsx",

  async render(definition: ReportDefinition, rows: ReportRow[], meta: ReportMeta): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "UniClub";
    workbook.lastModifiedBy = "UniClub";
    workbook.created = FIXED_EPOCH;
    workbook.modified = FIXED_EPOCH;

    const sheet = workbook.addWorksheet("Rapor", {
      views: [{ state: "frozen", ySplit: 4 }],
    });

    const accent = parseArgb(meta.primaryColor) ?? "FF1E3A5F";

    sheet.getCell(1, 1).value = meta.universityName;
    sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: accent } };
    sheet.getCell(2, 1).value = meta.reportTitleTr;
    sheet.getCell(2, 1).font = { bold: true, size: 12 };
    sheet.getCell(3, 1).value = meta.parameterSummaryTr;
    sheet.getCell(3, 1).font = { size: 10 };

    const headerRowIndex = 5;
    definition.columns.forEach((col, idx) => {
      const cell = sheet.getCell(headerRowIndex, idx + 1);
      cell.value = col.labelTr;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: accent },
      };
      if (col.width) sheet.getColumn(idx + 1).width = col.width;
    });

    rows.forEach((row, rowIdx) => {
      definition.columns.forEach((col, colIdx) => {
        const cell = sheet.getCell(headerRowIndex + 1 + rowIdx, colIdx + 1);
        cell.value = formatCellValue(row[col.key], col.type);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer);
  },
};
