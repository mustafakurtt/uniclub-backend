import { TenantSettingKey } from "../../tenant-settings/tenant-settings.catalog";
import type { ReportDefinition } from "./report.types";

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    id: "clubs",
    format: "xlsx",
    labelTr: "Kulüp listesi",
    labelEn: "Club list",
    parameters: [
      {
        name: "status",
        type: "enum",
        labelTr: "Kulüp durumu",
        labelEn: "Club status",
        enumValues: ["pending", "approved", "rejected", "archived"],
      },
      {
        name: "createdFrom",
        type: "date",
        labelTr: "Oluşturulma başlangıcı",
        labelEn: "Created from",
      },
      {
        name: "createdTo",
        type: "date",
        labelTr: "Oluşturulma bitişi",
        labelEn: "Created to",
      },
    ],
    columns: [
      { key: "name", labelTr: "Kulüp adı", labelEn: "Club name", type: "text", width: 32 },
      { key: "slug", labelTr: "Kısa ad", labelEn: "Short name", type: "text", width: 24 },
      { key: "status", labelTr: "Durum", labelEn: "Status", type: "enum", width: 14 },
      { key: "joinPolicy", labelTr: "Katılım koşulu", labelEn: "Join policy", type: "enum", width: 18 },
      { key: "createdAt", labelTr: "Oluşturulma", labelEn: "Created at", type: "date", width: 22 },
    ],
  },
  {
    id: "club-members",
    format: "xlsx",
    labelTr: "Kulüp üye listesi",
    labelEn: "Club member list",
    parameters: [
      {
        name: "clubId",
        type: "string",
        required: true,
        labelTr: "Kulüp",
        labelEn: "Club",
      },
      {
        name: "role",
        type: "enum",
        labelTr: "Kulüp rolü",
        labelEn: "Club role",
        enumValues: ["member", "officer", "president"],
      },
      {
        name: "status",
        type: "enum",
        labelTr: "Üyelik durumu",
        labelEn: "Membership status",
        enumValues: ["pending", "approved", "rejected"],
      },
    ],
    columns: [
      { key: "studentNumber", labelTr: "Öğrenci no", labelEn: "Student number", type: "text", width: 16 },
      { key: "firstName", labelTr: "Ad", labelEn: "First name", type: "text", width: 18 },
      { key: "lastName", labelTr: "Soyad", labelEn: "Last name", type: "text", width: 18 },
      { key: "email", labelTr: "E-posta", labelEn: "Email", type: "text", width: 28 },
      { key: "role", labelTr: "Kulüp rolü", labelEn: "Club role", type: "enum", width: 14 },
      { key: "status", labelTr: "Üyelik durumu", labelEn: "Membership status", type: "enum", width: 14 },
      { key: "joinedAt", labelTr: "Katılım tarihi", labelEn: "Joined at", type: "date", width: 22 },
    ],
  },
  {
    id: "activities",
    format: "xlsx",
    labelTr: "Etkinlik takvimi",
    labelEn: "Activity calendar",
    parameters: [
      {
        name: "from",
        type: "date",
        labelTr: "Başlangıç tarihi",
        labelEn: "From date",
      },
      {
        name: "to",
        type: "date",
        labelTr: "Bitiş tarihi",
        labelEn: "To date",
      },
      {
        name: "clubId",
        type: "string",
        labelTr: "Kulüp",
        labelEn: "Club",
      },
      {
        name: "status",
        type: "enum",
        labelTr: "Etkinlik durumu",
        labelEn: "Activity status",
        enumValues: ["draft", "published", "cancelled"],
      },
    ],
    columns: [
      { key: "title", labelTr: "Başlık", labelEn: "Title", type: "text", width: 32 },
      { key: "hostClubName", labelTr: "Düzenleyen kulüp", labelEn: "Organizing club", type: "text", width: 24 },
      { key: "startsAt", labelTr: "Başlangıç", labelEn: "Starts at", type: "date", width: 22 },
      { key: "endsAt", labelTr: "Bitiş", labelEn: "Ends at", type: "date", width: 22 },
      { key: "location", labelTr: "Konum", labelEn: "Location", type: "text", width: 28 },
      { key: "status", labelTr: "Durum", labelEn: "Status", type: "enum", width: 14 },
    ],
  },
  {
    id: "annual-activity-report",
    format: "pdf",
    labelTr: "Yıllık faaliyet raporu",
    labelEn: "Annual activity report",
    featureFlagKey: TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED,
    parameters: [
      {
        name: "year",
        type: "integer",
        required: true,
        labelTr: "Yıl",
        labelEn: "Year",
      },
    ],
    columns: [
      { key: "clubName", labelTr: "Kulüp", labelEn: "Club", type: "text", width: 32 },
      { key: "activityCount", labelTr: "Etkinlik sayısı", labelEn: "Activity count", type: "number", width: 16 },
      { key: "participationCount", labelTr: "Katılım", labelEn: "Participation", type: "number", width: 14 },
    ],
  },
  {
    id: "application-decision-minutes",
    format: "pdf",
    labelTr: "Kulüp başvuru karar tutanağı",
    labelEn: "Club application decision minutes",
    featureFlagKey: TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED,
    parameters: [
      {
        name: "applicationId",
        type: "string",
        required: true,
        labelTr: "Başvuru",
        labelEn: "Application",
      },
    ],
    columns: [
      { key: "step", labelTr: "Kademe", labelEn: "Step", type: "number", width: 10 },
      { key: "approverRoleLabel", labelTr: "Unvan", labelEn: "Role", type: "text", width: 22 },
      { key: "approverName", labelTr: "Ad", labelEn: "Name", type: "text", width: 24 },
      { key: "decisionLabel", labelTr: "Karar", labelEn: "Decision", type: "text", width: 18 },
      { key: "reviewedAt", labelTr: "Tarih", labelEn: "Date", type: "date", width: 22 },
      { key: "note", labelTr: "Not", labelEn: "Note", type: "text", width: 36 },
    ],
  },
  {
    id: "general-meeting-minutes",
    format: "pdf",
    labelTr: "Genel kurul toplantı tutanağı",
    labelEn: "General meeting minutes",
    featureFlagKey: TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED,
    parameters: [
      {
        name: "meetingId",
        type: "string",
        required: true,
        labelTr: "Genel kurul kaydı",
        labelEn: "General meeting record",
      },
    ],
    columns: [
      { key: "fullName", labelTr: "Ad", labelEn: "Name", type: "text", width: 28 },
      { key: "titleLabel", labelTr: "Unvan", labelEn: "Title", type: "text", width: 22 },
      { key: "seatLabel", labelTr: "Koltuk", labelEn: "Seat", type: "text", width: 14 },
      { key: "boardLabel", labelTr: "Kurul", labelEn: "Board", type: "text", width: 18 },
    ],
  },
  {
    id: "club-handover-minutes",
    format: "pdf",
    labelTr: "Devir teslim tutanağı",
    labelEn: "Handover minutes",
    featureFlagKey: TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED,
    parameters: [
      {
        name: "handoverId",
        type: "string",
        required: true,
        labelTr: "Devir teslim kaydı",
        labelEn: "Handover record",
      },
    ],
    columns: [
      { key: "fullName", labelTr: "Ad", labelEn: "Name", type: "text", width: 28 },
      { key: "titleLabel", labelTr: "Unvan", labelEn: "Title", type: "text", width: 22 },
      { key: "seatLabel", labelTr: "Koltuk", labelEn: "Seat", type: "text", width: 14 },
      { key: "boardLabel", labelTr: "Kurul", labelEn: "Board", type: "text", width: 18 },
      { key: "phaseLabel", labelTr: "Devir", labelEn: "Phase", type: "text", width: 16 },
    ],
  },
];

export function findReportDefinition(reportId: string): ReportDefinition | undefined {
  return REPORT_CATALOG.find((r) => r.id === reportId);
}
