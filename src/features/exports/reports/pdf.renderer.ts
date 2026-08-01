import PDFDocument from "pdfkit";
import type PDFKit from "pdfkit";
import { EXPORT_PDF_EPOCH_MS } from "../exports.constants";
import { DEJAVU_SANS_FONT_PATH } from "../assets/font-path";
import { stabilizePdfBytes } from "./pdf-stabilize";
import type {
  ReportDefinition,
  ReportMeta,
  ReportRenderer,
  ReportRow,
} from "./report.types";

const FONT_REGULAR = "DejaVuSans";
const FONT_BOLD = "DejaVuSans-Bold";
const FIXED_PDF_DATE = new Date(EXPORT_PDF_EPOCH_MS);

const APPROVER_ROLE_LABELS_TR: Record<string, string> = {
  club_approver: "Kulüp onaylayıcı",
  advisor: "Danışman",
  student_affairs: "SKS görevlisi",
  university_admin: "Okul yöneticisi",
  academic_affairs: "Öğrenci işleri görevlisi",
  content_moderator: "İçerik moderatörü",
  auditor: "Denetim görevlisi",
};

const DECISION_LABELS_TR: Record<string, string> = {
  approved: "Onaylandı",
  rejected: "Reddedildi",
  pending: "Beklemede",
  revision_requested: "Revizyon istendi",
};

const APPLICATION_STATUS_LABELS_TR: Record<string, string> = {
  approved: "Onaylandı",
  rejected: "Reddedildi",
  pending: "Beklemede",
  revision_requested: "Revizyon istendi",
};

function parseRgb(hex?: string | null): { r: number; g: number; b: number } {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return { r: 30, g: 58, b: 95 };
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function registerFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(FONT_REGULAR, DEJAVU_SANS_FONT_PATH);
  const boldPath = DEJAVU_SANS_FONT_PATH.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf");
  try {
    doc.registerFont(FONT_BOLD, boldPath);
  } catch {
    doc.registerFont(FONT_BOLD, DEJAVU_SANS_FONT_PATH);
  }
}

function rgbHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function drawDocumentHeader(doc: PDFKit.PDFDocument, meta: ReportMeta, accent: { r: number; g: number; b: number }) {
  doc.font(FONT_BOLD).fontSize(16).fillColor(rgbHex(accent)).text(meta.universityName, { align: "center" });
  doc.moveDown(0.4);
  doc.font(FONT_BOLD).fontSize(13).fillColor("black").text(meta.reportTitleTr, { align: "center" });
  doc.moveDown(0.3);
  doc.font(FONT_REGULAR).fontSize(10).text(meta.parameterSummaryTr, { align: "center" });
  doc.moveDown(1);
}

function drawSignatureBlocks(doc: PDFKit.PDFDocument, blocks: Array<{ title: string; nameLine?: string }>) {
  const startY = doc.page.height - 50 - blocks.length * 72;
  if (doc.y > startY - 20) {
    doc.addPage();
  }
  doc.y = Math.max(doc.y + 24, startY);

  for (const block of blocks) {
    doc.font(FONT_REGULAR).fontSize(10).fillColor("black");
    doc.text(block.title);
    if (block.nameLine) {
      doc.text(block.nameLine);
    }
    doc.text("Ad: .................................................");
    doc.text("Tarih: .................................................");
    doc.moveDown(0.2);
    doc.rect(doc.x, doc.y, 220, 36).stroke();
    doc.text("İmza", doc.x + 4, doc.y - 28);
    doc.moveDown(2.5);
  }
}

async function renderPdfDocument(
  render: (doc: PDFKit.PDFDocument, fonts: { regular: string; bold: string }) => void
): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    compress: false,
    info: {
      Producer: "UniClub",
      Creator: "UniClub",
      CreationDate: FIXED_PDF_DATE,
      ModDate: FIXED_PDF_DATE,
    },
  });

  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    doc.on("end", () => resolve(stabilizePdfBytes(new Uint8Array(Buffer.concat(chunks)))));
    doc.on("error", reject);
    render(doc, { regular: FONT_REGULAR, bold: FONT_BOLD });
    doc.end();
  });

  return bytes;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: ReportDefinition["columns"],
  fonts: { regular: string; bold: string },
  accent: { r: number; g: number; b: number }
) {
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;
  let x = doc.page.margins.left;
  const y = doc.y;

  for (const col of columns) {
    doc.save();
    doc.fillColor(rgbHex(accent));
    doc.rect(x, y, colWidth, 20).fill();
    doc.fillColor("white");
    doc.font(fonts.bold).fontSize(9).text(col.labelTr, x + 4, y + 5, {
      width: colWidth - 8,
      lineBreak: false,
    });
    doc.restore();
    x += colWidth;
  }
  doc.y = y + 22;
  doc.fillColor("black").font(fonts.regular);
}

function drawTableRows(
  doc: PDFKit.PDFDocument,
  definition: ReportDefinition,
  rows: ReportRow[],
  fonts: { regular: string }
) {
  const columns = definition.columns;
  const colWidth =
    (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  for (const row of rows) {
    if (doc.y + 18 > pageBottom) {
      doc.addPage();
      doc.font(fonts.regular).fontSize(9);
    }
    let x = doc.page.margins.left;
    const y = doc.y;
    for (const col of columns) {
      const raw = row[col.key];
      const text = raw === null || raw === undefined ? "" : String(raw);
      doc.text(text, x + 4, y, { width: colWidth - 8, lineBreak: false });
      x += colWidth;
    }
    doc.y = y + 16;
  }
}

function renderAnnualActivity(
  doc: PDFKit.PDFDocument,
  definition: ReportDefinition,
  rows: ReportRow[],
  meta: ReportMeta,
  fonts: { regular: string; bold: string }
) {
  const accent = parseRgb(meta.primaryColor);
  drawDocumentHeader(doc, meta, accent);

  const summary = meta.annualActivitySummary;
  if (summary) {
    doc.font(fonts.regular).fontSize(11);
    doc.text(`Kulüp sayısı: ${summary.clubCount}`);
    doc.text(`Etkinlik sayısı: ${summary.activityCount}`);
    doc.text(`Toplam katılım: ${summary.totalParticipation}`);
    doc.moveDown(1);
  }

  drawTableHeader(doc, definition.columns, fonts, accent);
  doc.font(fonts.regular).fontSize(9);
  drawTableRows(doc, definition, rows, fonts);

  drawSignatureBlocks(doc, [
    { title: "Öğrenci Kulüpleri Koordinatörlüğü" },
    { title: "Okul Yöneticisi" },
  ]);
}

function renderBoardMemberList(
  doc: PDFKit.PDFDocument,
  fonts: { regular: string; bold: string },
  title: string,
  members: Array<{ fullName: string; titleLabel: string }>
) {
  doc.font(fonts.bold).fontSize(10).text(title);
  doc.font(fonts.regular).fontSize(9);
  if (members.length === 0) {
    doc.text("—");
  } else {
    for (const member of members) {
      doc.text(`${member.titleLabel}: ${member.fullName}`);
    }
  }
  doc.moveDown(0.5);
}

function renderGeneralMeetingMinutes(
  doc: PDFKit.PDFDocument,
  definition: ReportDefinition,
  rows: ReportRow[],
  meta: ReportMeta,
  fonts: { regular: string; bold: string }
) {
  const accent = parseRgb(meta.primaryColor);
  drawDocumentHeader(doc, meta, accent);

  const header = meta.generalMeetingMinutes;
  if (header) {
    doc.font(fonts.bold).fontSize(11).text("Topluluk bilgileri");
    doc.font(fonts.regular).fontSize(10);
    doc.text(`Topluluk adı: ${header.clubName}`);
    doc.text(`Akademik danışman: ${header.advisorName ?? "—"}`);
    doc.moveDown(0.5);
    doc.font(fonts.bold).fontSize(11).text("Toplantı bilgileri");
    doc.font(fonts.regular).fontSize(10);
    doc.text(`Tür: ${header.meetingTypeLabel}`);
    doc.text(`Tarih ve saat: ${header.heldAtLabel}`);
    doc.text(`Yer: ${header.location}`);
    doc.moveDown(0.5);
    doc.font(fonts.bold).fontSize(11).text("Alınan kararlar");
    doc.font(fonts.regular).fontSize(10).text(header.decisions);
    doc.moveDown(0.8);
    renderBoardMemberList(doc, fonts, "Yönetim Kurulu — Asil Üyeler", header.managementPrincipal);
    renderBoardMemberList(doc, fonts, "Yönetim Kurulu — Yedek Üyeler", header.managementAlternate);
    renderBoardMemberList(doc, fonts, "Denetleme Kurulu — Asil Üyeler", header.auditPrincipal);
    renderBoardMemberList(doc, fonts, "Denetleme Kurulu — Yedek Üyeler", header.auditAlternate);
    doc.moveDown(0.5);
  }

  if (rows.length > 0) {
    doc.font(fonts.bold).fontSize(11).text("Kurul üyeleri (özet tablo)");
    doc.moveDown(0.3);
    drawTableHeader(doc, definition.columns, fonts, accent);
    doc.font(fonts.regular).fontSize(9);
    drawTableRows(doc, definition, rows, fonts);
  }

  const advisorName = header?.advisorName;
  drawSignatureBlocks(doc, [
    { title: "Topluluk Başkanı" },
    {
      title: "Akademik Danışman",
      nameLine: advisorName ? `Uygundur — ${advisorName}` : "Uygundur",
    },
  ]);
}

function renderListSection(
  doc: PDFKit.PDFDocument,
  fonts: { regular: string; bold: string },
  title: string,
  items: string[]
) {
  doc.font(fonts.bold).fontSize(10).text(title);
  doc.font(fonts.regular).fontSize(9);
  if (items.length === 0) {
    doc.text("—");
  } else {
    for (const item of items) {
      doc.text(`• ${item}`);
    }
  }
  doc.moveDown(0.5);
}

function renderClubHandoverMinutes(
  doc: PDFKit.PDFDocument,
  definition: ReportDefinition,
  rows: ReportRow[],
  meta: ReportMeta,
  fonts: { regular: string; bold: string }
) {
  const accent = parseRgb(meta.primaryColor);
  drawDocumentHeader(doc, meta, accent);

  const header = meta.clubHandoverMinutes;
  if (header) {
    doc.font(fonts.bold).fontSize(11).text("Topluluk bilgileri");
    doc.font(fonts.regular).fontSize(10);
    doc.text(`Topluluk adı: ${header.clubName}`);
    doc.text(`Akademik dönem: ${header.academicTermName}`);
    doc.text(`Akademik danışman: ${header.advisorName ?? "—"}`);
    doc.moveDown(0.5);
    doc.font(fonts.bold).fontSize(11).text("Devir teslim bilgileri");
    doc.font(fonts.regular).fontSize(10);
    doc.text(`Devir tarihi: ${header.handoverAtLabel}`);
    doc.text(`Dayandığı genel kurul: ${header.meetingHeldAtLabel} — ${header.meetingLocation}`);
    doc.moveDown(0.8);
    doc.font(fonts.bold).fontSize(11).text("Devreden kurul");
    doc.moveDown(0.3);
    renderBoardMemberList(doc, fonts, "Yönetim Kurulu — Asil Üyeler", header.outgoingManagementPrincipal);
    renderBoardMemberList(doc, fonts, "Yönetim Kurulu — Yedek Üyeler", header.outgoingManagementAlternate);
    renderBoardMemberList(doc, fonts, "Denetleme Kurulu — Asil Üyeler", header.outgoingAuditPrincipal);
    renderBoardMemberList(doc, fonts, "Denetleme Kurulu — Yedek Üyeler", header.outgoingAuditAlternate);
    doc.moveDown(0.5);
    doc.font(fonts.bold).fontSize(11).text("Devralan kurul");
    doc.moveDown(0.3);
    renderBoardMemberList(doc, fonts, "Yönetim Kurulu — Asil Üyeler", header.incomingManagementPrincipal);
    renderBoardMemberList(doc, fonts, "Yönetim Kurulu — Yedek Üyeler", header.incomingManagementAlternate);
    renderBoardMemberList(doc, fonts, "Denetleme Kurulu — Asil Üyeler", header.incomingAuditPrincipal);
    renderBoardMemberList(doc, fonts, "Denetleme Kurulu — Yedek Üyeler", header.incomingAuditAlternate);
    doc.moveDown(0.5);
    doc.font(fonts.bold).fontSize(11).text("Devredilen kalemler");
    doc.moveDown(0.3);
    renderListSection(doc, fonts, "Bekleyen katılım istekleri", header.pendingJoinRequestLabels);
    renderListSection(doc, fonts, "Devam eden etkinlikler", header.ongoingActivityLabels);
    renderListSection(doc, fonts, "Danışman ilişkisi", header.advisorLabels);
    doc.moveDown(0.5);
  }

  if (rows.length > 0) {
    doc.font(fonts.bold).fontSize(11).text("Kurul üyeleri (özet tablo)");
    doc.moveDown(0.3);
    drawTableHeader(doc, definition.columns, fonts, accent);
    doc.font(fonts.regular).fontSize(9);
    drawTableRows(doc, definition, rows, fonts);
  }

  const advisorName = header?.advisorName;
  drawSignatureBlocks(doc, [
    {
      title: "Devreden Başkan",
      nameLine: header?.outgoingPresidentName ?? undefined,
    },
    {
      title: "Devralan Başkan",
      nameLine: header?.incomingPresidentName ?? undefined,
    },
    {
      title: "Akademik Danışman",
      nameLine: advisorName ? `Uygundur — ${advisorName}` : "Uygundur",
    },
  ]);
}

function renderApplicationMinutes(
  doc: PDFKit.PDFDocument,
  definition: ReportDefinition,
  rows: ReportRow[],
  meta: ReportMeta,
  fonts: { regular: string; bold: string }
) {
  const accent = parseRgb(meta.primaryColor);
  drawDocumentHeader(doc, meta, accent);

  const header = meta.applicationMinutes;
  if (header) {
    doc.font(fonts.bold).fontSize(11).text("Başvuru bilgileri");
    doc.font(fonts.regular).fontSize(10);
    doc.text(`Önerilen kulüp adı: ${header.proposedName}`);
    if (header.description) doc.text(`Açıklama: ${header.description}`);
    doc.text(`Başvuran: ${header.applicantName} (${header.applicantEmail})`);
    doc.text(
      `Özet durum: ${APPLICATION_STATUS_LABELS_TR[header.applicationStatus] ?? header.applicationStatus}`
    );
    doc.moveDown(1);
    doc.font(fonts.bold).fontSize(11).text("Onay zinciri");
    doc.moveDown(0.3);
  }

  drawTableHeader(doc, definition.columns, fonts, accent);
  doc.font(fonts.regular).fontSize(9);
  drawTableRows(doc, definition, rows, fonts);

  const signatureBlocks: Array<{ title: string; nameLine?: string }> = rows.map((row) => ({
    title: String(row.approverRoleLabel ?? "Onaylayan"),
    nameLine: row.approverName ? String(row.approverName) : undefined,
  }));
  if (signatureBlocks.length === 0) {
    signatureBlocks.push({ title: "Onaylayan" });
  }
  drawSignatureBlocks(doc, signatureBlocks);
}

export const pdfReportRenderer: ReportRenderer = {
  format: "pdf",
  contentType: "application/pdf",
  extension: "pdf",

  async render(definition: ReportDefinition, rows: ReportRow[], meta: ReportMeta): Promise<Uint8Array> {
    return await renderPdfDocument((doc, fonts) => {
      switch (definition.id) {
        case "annual-activity-report":
          renderAnnualActivity(doc, definition, rows, meta, fonts);
          break;
        case "application-decision-minutes":
          renderApplicationMinutes(doc, definition, rows, meta, fonts);
          break;
        case "general-meeting-minutes":
          renderGeneralMeetingMinutes(doc, definition, rows, meta, fonts);
          break;
        case "club-handover-minutes":
          renderClubHandoverMinutes(doc, definition, rows, meta, fonts);
          break;
        default:
          throw new Error(`PDF renderer: desteklenmeyen rapor '${definition.id}'`);
      }
    });
  },
};

export function formatApproverRoleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return APPROVER_ROLE_LABELS_TR[role] ?? role;
}

export function formatDecisionLabel(status: string): string {
  return DECISION_LABELS_TR[status] ?? status;
}
