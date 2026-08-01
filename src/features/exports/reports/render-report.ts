import { xlsxReportRenderer } from "./xlsx.renderer";
import { csvReportRenderer } from "./csv.renderer";
import type { ReportDefinition, ReportMeta, ReportRow, RenderResult } from "./report.types";

export async function renderReportFile(
  definition: ReportDefinition,
  rows: ReportRow[],
  meta: ReportMeta
): Promise<RenderResult> {
  try {
    const bytes = await xlsxReportRenderer.render(definition, rows, meta);
    return {
      bytes,
      contentType: xlsxReportRenderer.contentType,
      extension: xlsxReportRenderer.extension,
      usedFallback: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const bytes = await csvReportRenderer.render(definition, rows, meta);
    return {
      bytes,
      contentType: csvReportRenderer.contentType,
      extension: csvReportRenderer.extension,
      usedFallback: true,
      fallbackReason: message,
    };
  }
}
