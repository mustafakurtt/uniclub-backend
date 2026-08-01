import { badRequest, notFound } from "../../shared/utils/errors";
import { slugify } from "../../shared/utils/slug.util";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { isTenantFeatureEnabled, isTenantSettingKey } from "../tenant-settings/tenant-settings.catalog";
import { exportsRepository } from "./exports.repository";
import { EXPORT_MAX_ROWS } from "./exports.constants";
import {
  activitiesExportParamsSchema,
  annualActivityReportParamsSchema,
  applicationDecisionMinutesParamsSchema,
  clubMembersExportParamsSchema,
  clubsExportParamsSchema,
  generalMeetingMinutesParamsSchema,
  clubHandoverMinutesParamsSchema,
  type ActivitiesExportParams,
  type AnnualActivityReportParams,
  type ApplicationDecisionMinutesParams,
  type ClubMembersExportParams,
  type ClubsExportParams,
  type ExportParams,
  type GeneralMeetingMinutesParams,
  type ClubHandoverMinutesParams,
} from "./exports.schema";
import { findReportDefinition, REPORT_CATALOG } from "./reports/report-catalog";
import { formatApproverRoleLabel, formatDecisionLabel } from "./reports/pdf.renderer";
import { renderReportFile } from "./reports/render-report";
import type { ReportMeta, ReportRow } from "./reports/report.types";

function formatDateTr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function summarizeParamsTr(reportId: string, params: ExportParams): string {
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
  } else if (reportId === "annual-activity-report") {
    const p = params as AnnualActivityReportParams;
    parts.push(`yıl=${p.year}`);
  } else if (reportId === "application-decision-minutes") {
    const p = params as ApplicationDecisionMinutesParams;
    parts.push(`başvuru=${p.applicationId}`);
  } else if (reportId === "general-meeting-minutes") {
    const p = params as GeneralMeetingMinutesParams;
    parts.push(`toplantı=${p.meetingId}`);
  } else if (reportId === "club-handover-minutes") {
    const p = params as ClubHandoverMinutesParams;
    parts.push(`devir=${p.handoverId}`);
  }
  return parts.length > 0 ? parts.join(", ") : "tüm kayıtlar";
}

function summarizeParamsEn(reportId: string, params: ExportParams): string {
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
  } else if (reportId === "annual-activity-report") {
    const p = params as AnnualActivityReportParams;
    parts.push(`year=${p.year}`);
  } else if (reportId === "application-decision-minutes") {
    const p = params as ApplicationDecisionMinutesParams;
    parts.push(`application=${p.applicationId}`);
  } else if (reportId === "general-meeting-minutes") {
    const p = params as GeneralMeetingMinutesParams;
    parts.push(`meeting=${p.meetingId}`);
  } else if (reportId === "club-handover-minutes") {
    const p = params as ClubHandoverMinutesParams;
    parts.push(`handover=${p.handoverId}`);
  }
  return parts.length > 0 ? parts.join(", ") : "all records";
}

function filenameParamSlug(summary: string): string {
  const slug = slugify(summary).slice(0, 48);
  return slug || "all";
}

function isReportVisible(
  definition: { featureFlagKey?: string },
  settings: Awaited<ReturnType<typeof getTenantSettings>>
): boolean {
  if (!definition.featureFlagKey) return true;
  if (!isTenantSettingKey(definition.featureFlagKey)) return true;
  return isTenantFeatureEnabled(settings, definition.featureFlagKey);
}

function parseReportParams(reportId: string, body: unknown): ExportParams {
  switch (reportId) {
    case "clubs":
      return clubsExportParamsSchema.parse(body ?? {});
    case "club-members":
      return clubMembersExportParamsSchema.parse(body ?? {});
    case "activities":
      return activitiesExportParamsSchema.parse(body ?? {});
    case "annual-activity-report":
      return annualActivityReportParamsSchema.parse(body ?? {});
    case "application-decision-minutes":
      return applicationDecisionMinutesParamsSchema.parse(body ?? {});
    case "general-meeting-minutes":
      return generalMeetingMinutesParamsSchema.parse(body ?? {});
    case "club-handover-minutes":
      return clubHandoverMinutesParamsSchema.parse(body ?? {});
    default:
      throw notFound("exports.reportNotFound");
  }
}

async function fetchRows(
  reportId: string,
  universityId: string,
  params: ExportParams
): Promise<{ rows: ReportRow[]; metaExtras?: Partial<ReportMeta> }> {
  switch (reportId) {
    case "clubs":
      return {
        rows: await exportsRepository.fetchClubsRows(universityId, params as ClubsExportParams),
      };
    case "club-members": {
      const p = params as ClubMembersExportParams;
      const club = await exportsRepository.findClubInUniversity(universityId, p.clubId);
      if (!club) throw notFound("exports.clubNotFound");
      return { rows: await exportsRepository.fetchClubMembersRows(universityId, p) };
    }
    case "activities": {
      const p = params as ActivitiesExportParams;
      if (p.clubId) {
        const club = await exportsRepository.findClubInUniversity(universityId, p.clubId);
        if (!club) throw notFound("exports.clubNotFound");
      }
      return { rows: await exportsRepository.fetchActivitiesRows(universityId, p) };
    }
    case "annual-activity-report": {
      const p = params as AnnualActivityReportParams;
      const report = await exportsRepository.fetchAnnualActivityReport(universityId, p.year);
      return {
        rows: report.clubRows,
        metaExtras: { annualActivitySummary: report.summary },
      };
    }
    case "application-decision-minutes": {
      const p = params as ApplicationDecisionMinutesParams;
      const data = await exportsRepository.fetchApplicationDecisionMinutes(universityId, p.applicationId);
      if (!data) throw notFound("exports.applicationNotFound");
      return {
        rows: data.approvalRows.map((row) => ({
          step: row.step,
          approverRoleLabel: formatApproverRoleLabel(row.approverRole),
          approverName: row.approverName,
          decisionLabel: formatDecisionLabel(row.decision),
          reviewedAt: row.reviewedAt,
          note: row.note ?? null,
        })),
        metaExtras: { applicationMinutes: data.header },
      };
    }
    case "general-meeting-minutes": {
      const p = params as GeneralMeetingMinutesParams;
      const data = await exportsRepository.fetchGeneralMeetingMinutes(universityId, p.meetingId);
      if (!data) throw notFound("exports.meetingNotFound");
      return {
        rows: data.rows,
        metaExtras: { generalMeetingMinutes: data.header },
      };
    }
    case "club-handover-minutes": {
      const p = params as ClubHandoverMinutesParams;
      const data = await exportsRepository.fetchClubHandoverMinutes(universityId, p.handoverId);
      if (!data) throw notFound("exports.handoverNotFound");
      return {
        rows: data.rows,
        metaExtras: { clubHandoverMinutes: data.header },
      };
    }
    default:
      throw notFound("exports.reportNotFound");
  }
}

export const exportsService = {
  async listCatalog(universityId: string) {
    const settings = await getTenantSettings(universityId);
    return REPORT_CATALOG
      .filter((r) => isReportVisible(r, settings))
      .map((r) => ({
        id: r.id,
        labelTr: r.labelTr,
        labelEn: r.labelEn,
        format: r.format,
        parameters: r.parameters,
      }));
  },

  async generateReport(universityId: string, reportId: string, body: unknown) {
    const definition = findReportDefinition(reportId);
    if (!definition) throw notFound("exports.reportNotFound");

    const settings = await getTenantSettings(universityId);
    if (!isReportVisible(definition, settings)) {
      throw notFound("exports.reportNotFound");
    }

    const university = await exportsRepository.findUniversity(universityId);
    if (!university) throw notFound("exports.reportNotFound");

    const params = parseReportParams(reportId, body);
    const { rows, metaExtras } = await fetchRows(reportId, universityId, params);

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
      ...metaExtras,
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
