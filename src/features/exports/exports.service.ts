import { badRequest, notFound } from "../../shared/utils/errors";
import { exportsRepository } from "./exports.repository";
import { EXPORT_MAX_ROWS } from "./exports.constants";
import {
  activitiesExportParamsSchema,
  clubMembersExportParamsSchema,
  clubsExportParamsSchema,
  type ActivitiesExportParams,
  type ClubMembersExportParams,
  type ClubsExportParams,
} from "./exports.schema";
import { findReportDefinition, REPORT_CATALOG } from "./reports/report-catalog";
import { renderReportFile } from "./reports/render-report";
import type { ReportMeta, ReportRow } from "./reports/report.types";

function formatDateTr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function summarizeParamsTr(
  reportId: string,
  params: ClubsExportParams | ClubMembersExportParams | ActivitiesExportParams
): string {
  const parts: string[] = [];
  if (reportId === "clubs") {
    const p = params as ClubsExportParams;
    if (p.status) parts.push(`durum=${p.status}`);
    if (p.createdFrom) parts.push(`başlangıç=${formatDateTr(p.createdFrom)}`);
    if (p.createdTo) parts.push(`bitiş=${formatDateTr(p.createdTo)}`);
  } else if (reportId === "club-members") {
    const p = params as ClubMembersExportParams;
    parts.push(`kulüp=${p.clubId}`);
    if (p.role) parts.push(`rol=${p.role}`);
    if (p.status) parts.push(`durum=${p.status}`);
  } else if (reportId === "activities") {
    const p = params as ActivitiesExportParams;
    if (p.from) parts.push(`başlangıç=${formatDateTr(p.from)}`);
    if (p.to) parts.push(`bitiş=${formatDateTr(p.to)}`);
    if (p.clubId) parts.push(`kulüp=${p.clubId}`);
    if (p.status) parts.push(`durum=${p.status}`);
  }
  return parts.length > 0 ? parts.join(", ") : "tüm kayıtlar";
}

function summarizeParamsEn(
  reportId: string,
  params: ClubsExportParams | ClubMembersExportParams | ActivitiesExportParams
): string {
  const parts: string[] = [];
  if (reportId === "clubs") {
    const p = params as ClubsExportParams;
    if (p.status) parts.push(`status=${p.status}`);
    if (p.createdFrom) parts.push(`from=${formatDateTr(p.createdFrom)}`);
    if (p.createdTo) parts.push(`to=${formatDateTr(p.createdTo)}`);
  } else if (reportId === "club-members") {
    const p = params as ClubMembersExportParams;
    parts.push(`club=${p.clubId}`);
    if (p.role) parts.push(`role=${p.role}`);
    if (p.status) parts.push(`status=${p.status}`);
  } else if (reportId === "activities") {
    const p = params as ActivitiesExportParams;
    if (p.from) parts.push(`from=${formatDateTr(p.from)}`);
    if (p.to) parts.push(`to=${formatDateTr(p.to)}`);
    if (p.clubId) parts.push(`club=${p.clubId}`);
    if (p.status) parts.push(`status=${p.status}`);
  }
  return parts.length > 0 ? parts.join(", ") : "all records";
}

function filenameParamSlug(summary: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "all";
}

function parseReportParams(reportId: string, body: unknown) {
  switch (reportId) {
    case "clubs":
      return clubsExportParamsSchema.parse(body ?? {});
    case "club-members":
      return clubMembersExportParamsSchema.parse(body ?? {});
    case "activities":
      return activitiesExportParamsSchema.parse(body ?? {});
    default:
      throw notFound("exports.reportNotFound");
  }
}

async function fetchRows(
  reportId: string,
  universityId: string,
  params: ClubsExportParams | ClubMembersExportParams | ActivitiesExportParams
): Promise<ReportRow[]> {
  switch (reportId) {
    case "clubs":
      return exportsRepository.fetchClubsRows(universityId, params as ClubsExportParams);
    case "club-members": {
      const p = params as ClubMembersExportParams;
      const club = await exportsRepository.findClubInUniversity(universityId, p.clubId);
      if (!club) throw notFound("exports.clubNotFound");
      return exportsRepository.fetchClubMembersRows(universityId, p);
    }
    case "activities": {
      const p = params as ActivitiesExportParams;
      if (p.clubId) {
        const club = await exportsRepository.findClubInUniversity(universityId, p.clubId);
        if (!club) throw notFound("exports.clubNotFound");
      }
      return exportsRepository.fetchActivitiesRows(universityId, p);
    }
    default:
      throw notFound("exports.reportNotFound");
  }
}

export const exportsService = {
  listCatalog() {
    return REPORT_CATALOG.map((r) => ({
      id: r.id,
      labelTr: r.labelTr,
      labelEn: r.labelEn,
      parameters: r.parameters,
    }));
  },

  async generateReport(universityId: string, reportId: string, body: unknown) {
    const definition = findReportDefinition(reportId);
    if (!definition) throw notFound("exports.reportNotFound");

    const university = await exportsRepository.findUniversity(universityId);
    if (!university) throw notFound("exports.reportNotFound");

    const params = parseReportParams(reportId, body);
    const rows = await fetchRows(reportId, universityId, params);

    if (rows.length > EXPORT_MAX_ROWS) {
      throw badRequest("exports.rowLimitExceeded");
    }

    const paramSummaryTr = summarizeParamsTr(reportId, params);
    const paramSummaryEn = summarizeParamsEn(reportId, params);

    const meta: ReportMeta = {
      universityName: university.name,
      universitySlug: university.slug,
      reportTitleTr: definition.labelTr,
      reportTitleEn: definition.labelEn,
      parameterSummaryTr: paramSummaryTr,
      parameterSummaryEn: paramSummaryEn,
      primaryColor: university.primaryColor,
    };

    const rendered = await renderReportFile(definition, rows, meta);
    const filename = `${reportId}-${university.slug}-${filenameParamSlug(paramSummaryTr)}.${rendered.extension}`;

    return {
      filename,
      contentType: rendered.contentType,
      bytes: rendered.bytes,
      usedFallback: rendered.usedFallback,
      fallbackReason: rendered.fallbackReason,
      rowCount: rows.length,
    };
  },
};
