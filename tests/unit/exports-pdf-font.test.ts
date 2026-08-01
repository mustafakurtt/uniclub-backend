import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { DEJAVU_SANS_FONT_PATH } from "../../src/features/exports/assets/font-path";
import { pdfReportRenderer } from "../../src/features/exports/reports/pdf.renderer";
import { REPORT_CATALOG } from "../../src/features/exports/reports/report-catalog";

describe("PDF Unicode font gömülmesi", () => {
  it("DejaVu Sans dosyası depoda ve PDF'e gömülür", async () => {
    expect(existsSync(DEJAVU_SANS_FONT_PATH)).toBe(true);
    const fontBytes = readFileSync(DEJAVU_SANS_FONT_PATH);
    expect(fontBytes.length).toBeGreaterThan(100_000);

    const def = REPORT_CATALOG.find((r) => r.id === "annual-activity-report")!;
    const turkishTitle = "Öğrenci Kulüpleri Koordinatörlüğü — Işık Kulübü Faaliyet Özeti";
    const bytes = await pdfReportRenderer.render(
      def,
      [{ clubName: "Işık Kulübü", activityCount: 3, participationCount: 12 }],
      {
        universityName: turkishTitle,
        universitySlug: "test",
        reportTitleTr: "Yıllık faaliyet raporu",
        reportTitleEn: "Annual activity report",
        parameterSummaryTr: "yıl=2026",
        parameterSummaryEn: "year=2026",
        annualActivitySummary: {
          year: 2026,
          clubCount: 1,
          activityCount: 3,
          totalParticipation: 12,
        },
      }
    );

    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("DejaVuSans");
    expect(bytes.length).toBeGreaterThan(2000);
  });
});
