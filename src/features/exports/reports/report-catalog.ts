import type { ReportDefinition } from "./report.types";

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    id: "clubs",
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
      { key: "slug", labelTr: "Slug", labelEn: "Slug", type: "text", width: 24 },
      { key: "status", labelTr: "Durum", labelEn: "Status", type: "enum", width: 14 },
      { key: "joinPolicy", labelTr: "Katılım politikası", labelEn: "Join policy", type: "enum", width: 18 },
      { key: "createdAt", labelTr: "Oluşturulma", labelEn: "Created at", type: "date", width: 22 },
    ],
  },
  {
    id: "club-members",
    labelTr: "Kulüp üye listesi",
    labelEn: "Club member list",
    parameters: [
      {
        name: "clubId",
        type: "string",
        required: true,
        labelTr: "Kulüp kimliği",
        labelEn: "Club ID",
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
      { key: "role", labelTr: "Rol", labelEn: "Role", type: "enum", width: 14 },
      { key: "status", labelTr: "Durum", labelEn: "Status", type: "enum", width: 14 },
      { key: "joinedAt", labelTr: "Katılım", labelEn: "Joined at", type: "date", width: 22 },
    ],
  },
  {
    id: "activities",
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
        labelTr: "Kulüp kimliği",
        labelEn: "Club ID",
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
      { key: "hostClubName", labelTr: "Host kulüp", labelEn: "Host club", type: "text", width: 24 },
      { key: "startsAt", labelTr: "Başlangıç", labelEn: "Starts at", type: "date", width: 22 },
      { key: "endsAt", labelTr: "Bitiş", labelEn: "Ends at", type: "date", width: 22 },
      { key: "location", labelTr: "Konum", labelEn: "Location", type: "text", width: 28 },
      { key: "status", labelTr: "Durum", labelEn: "Status", type: "enum", width: 14 },
    ],
  },
];

export function findReportDefinition(reportId: string): ReportDefinition | undefined {
  return REPORT_CATALOG.find((r) => r.id === reportId);
}
