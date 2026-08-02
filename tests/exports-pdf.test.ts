/**
 * Kurumsal rapor dışa aktarma — PDF resmî belgeler (T4.5 v2).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import { login, me, reqAuth, data, get } from "./helpers";
import { db } from "../src/db";
import { clubHandoverRecords } from "../src/db/schema";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";
import { antalyaTechClubId } from "./tenant-test-helpers";
import type { HandoverBoardMemberSnapshot, HandoverTransferredItems } from "../src/db/schema/handover";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exportPost(
  universityId: string,
  reportId: string,
  token: string,
  body: unknown = {}
) {
  return reqAuth("POST", `/api/universities/${universityId}/exports/${reportId}`, token, body);
}

async function seedHandoverRecordForExport(universityId: string): Promise<string> {
  const existing = await db.query.clubHandoverRecords.findFirst({
    where: { universityId },
    columns: { id: true },
  });
  if (existing) return existing.id;

  const clubId = await antalyaTechClubId();
  const meeting = await db.query.clubGeneralMeetings.findFirst({
    where: { universityId, clubId },
    with: {
      boardMemberships: { with: { user: true } },
    },
  });
  if (!meeting) throw new Error("seed: genel kurul kaydı yok");

  const outgoingRows = await db.query.clubBoardMemberships.findMany({
    where: { clubId, endedAt: { isNull: true } },
    with: { user: true },
  });

  const outgoingBoardSnapshot: HandoverBoardMemberSnapshot[] = outgoingRows.map((row) => ({
    userId: row.userId,
    boardType: row.boardType,
    seatType: row.seatType,
    title: row.title,
    fullName: row.user ? `${row.user.firstName} ${row.user.lastName}` : null,
  }));

  const incomingBoardSnapshot: HandoverBoardMemberSnapshot[] = meeting.boardMemberships.map((row) => ({
    userId: row.userId,
    boardType: row.boardType,
    seatType: row.seatType,
    title: row.title,
    fullName: row.user ? `${row.user.firstName} ${row.user.lastName}` : null,
  }));

  const pendingJoin = await db.query.clubMembers.findMany({
    where: { clubId, universityId, status: "pending", leftAt: { isNull: true } },
    columns: { userId: true },
  });
  const advisors = await db.query.clubAdvisors.findMany({
    where: { clubId, universityId, leftAt: { isNull: true } },
    columns: { userId: true },
  });

  const transferredItems: HandoverTransferredItems = {
    pendingJoinRequestUserIds: pendingJoin.map((r) => r.userId),
    ongoingActivityIds: [],
    advisorUserIds: advisors.map((r) => r.userId),
  };

  const recorder = await db.query.users.findFirst({
    where: { email: "mustafa.kurt@std.antalya.edu.tr" },
    columns: { id: true },
  });
  if (!recorder) throw new Error("seed: mustafa yok");

  const [record] = await db
    .insert(clubHandoverRecords)
    .values({
      clubId,
      universityId,
      academicTermId: meeting.academicTermId,
      generalMeetingId: meeting.id,
      handoverAt: new Date("2025-06-01T10:00:00+03:00"),
      recordedBy: recorder.id,
      outgoingBoardSnapshot,
      incomingBoardSnapshot,
      transferredItems,
    })
    .returning({ id: clubHandoverRecords.id });

  return record.id;
}

describe("PDF resmî belgeler (/api/universities/:id/exports)", () => {
  let sks: string;
  let burak: string;
  let egeSks: string;
  let superAdmin: string;
  let antalyaUni: string;
  let egeUni: string;
  let handoverId: string;
  const currentYear = new Date().getFullYear();

  const settingsPath = (uni: string) => `/api/universities/${uni}/settings`;

  beforeAll(async () => {
    [sks, burak, egeSks, superAdmin] = await Promise.all([
      login("sks@antalya.edu.tr"),
      login("burak.demirci@std.antalya.edu.tr"),
      login("sks@egebilim.edu.tr"),
      login("superadmin@platform.local"),
    ]);
    antalyaUni = (await me(sks)).universityId as string;
    egeUni = (await me(egeSks)).universityId as string;
    handoverId = await seedHandoverRecordForExport(antalyaUni);
  });

  afterAll(async () => {
    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: {
        [TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED]: true,
        [TenantSettingKey.UNIVERSITY_EXPORT_ENABLED]: true,
      },
    });
  });

  it("katalog PDF raporlarını format alanıyla listeler", async () => {
    const res = await get(`/api/universities/${antalyaUni}/exports`, sks);
    expect(res.status).toBe(200);
    const catalog = await data<Array<{ id: string; format: string }>>(res);
    const ids = catalog.map((r) => r.id);
    expect(ids).toContain("annual-activity-report");
    expect(ids).toContain("application-decision-minutes");
    expect(ids).toContain("general-meeting-minutes");
    expect(ids).toContain("club-handover-minutes");
    expect(catalog.find((r) => r.id === "clubs")?.format).toBe("xlsx");
    expect(catalog.find((r) => r.id === "annual-activity-report")?.format).toBe("pdf");
  });

  it("yıllık faaliyet raporu → %PDF- başlığı ve gömülü font", async () => {
    const res = await exportPost(antalyaUni, "annual-activity-report", sks, { year: currentYear });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const bytes = new Uint8Array(await res.arrayBuffer());
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("DejaVuSans");
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("başvuru karar tutanağı → %PDF- ve gömülü font", async () => {
    const app = await db.query.clubApplications.findFirst({
      where: { universityId: antalyaUni, proposedName: "Müzik Kulübü", status: "approved" },
      columns: { id: true },
    });
    expect(app?.id).toBeTruthy();

    const res = await exportPost(antalyaUni, "application-decision-minutes", sks, {
      applicationId: app!.id,
    });
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("DejaVuSans");
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("genel kurul tutanağı → %PDF- ve gömülü font", async () => {
    const clubId = await antalyaTechClubId();
    const meeting = await db.query.clubGeneralMeetings.findFirst({
      where: { universityId: antalyaUni, clubId },
      columns: { id: true },
    });
    expect(meeting?.id).toBeTruthy();

    const res = await exportPost(antalyaUni, "general-meeting-minutes", sks, {
      meetingId: meeting!.id,
    });
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("DejaVuSans");
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("devir teslim tutanağı → %PDF- ve gömülü font", async () => {
    const res = await exportPost(antalyaUni, "club-handover-minutes", sks, { handoverId });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("DejaVuSans");
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("devir teslim tutanağı → aynı handoverId ile iki üretim aynı SHA-256", async () => {
    const body = { handoverId };
    const res1 = await exportPost(antalyaUni, "club-handover-minutes", sks, body);
    const res2 = await exportPost(antalyaUni, "club-handover-minutes", sks, body);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const hash1 = sha256(new Uint8Array(await res1.arrayBuffer()));
    const hash2 = sha256(new Uint8Array(await res2.arrayBuffer()));
    expect(hash1).toBe(hash2);
  });

  it("genel kurul tutanağı → aynı meetingId ile iki üretim aynı SHA-256", async () => {
    const clubId = await antalyaTechClubId();
    const meeting = await db.query.clubGeneralMeetings.findFirst({
      where: { universityId: antalyaUni, clubId },
      columns: { id: true },
    });
    expect(meeting?.id).toBeTruthy();

    const body = { meetingId: meeting!.id };
    const res1 = await exportPost(antalyaUni, "general-meeting-minutes", sks, body);
    const res2 = await exportPost(antalyaUni, "general-meeting-minutes", sks, body);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const hash1 = sha256(new Uint8Array(await res1.arrayBuffer()));
    const hash2 = sha256(new Uint8Array(await res2.arrayBuffer()));
    expect(hash1).toBe(hash2);
  });

  it("aynı parametrelerle iki PDF üretimi → aynı SHA-256", async () => {
    const body = { year: currentYear };
    const res1 = await exportPost(antalyaUni, "annual-activity-report", sks, body);
    const res2 = await exportPost(antalyaUni, "annual-activity-report", sks, body);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const hash1 = sha256(new Uint8Array(await res1.arrayBuffer()));
    const hash2 = sha256(new Uint8Array(await res2.arrayBuffer()));
    expect(hash1).toBe(hash2);
  });

  it("PDF bayrağı kapalı → katalogda PDF yok, üretim 404; xlsx hâlâ çalışır", async () => {
    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED]: false },
    });

    const catalog = await data<Array<{ id: string }>>(
      await get(`/api/universities/${antalyaUni}/exports`, sks)
    );
    expect(catalog.map((r) => r.id)).not.toContain("annual-activity-report");
    expect((await exportPost(antalyaUni, "annual-activity-report", sks, { year: currentYear })).status).toBe(
      404
    );
    expect((await exportPost(antalyaUni, "clubs", sks, {})).status).toBe(200);

    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED]: true },
    });
  });

  it("export ve PDF bayrağı kapalı → 404 (sıra karışmıyor)", async () => {
    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: {
        [TenantSettingKey.UNIVERSITY_EXPORT_ENABLED]: false,
        [TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED]: false,
      },
    });

    expect((await get(`/api/universities/${antalyaUni}/exports`, sks)).status).toBe(404);
    expect(
      (await exportPost(antalyaUni, "annual-activity-report", sks, { year: currentYear })).status
    ).toBe(404);

    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: {
        [TenantSettingKey.UNIVERSITY_EXPORT_ENABLED]: true,
        [TenantSettingKey.UNIVERSITY_EXPORT_PDF_ENABLED]: true,
      },
    });
  });

  it("Ege tenant — export kapalı → PDF üretim 404", async () => {
    expect((await exportPost(egeUni, "annual-activity-report", egeSks, { year: currentYear })).status).toBe(
      404
    );
  });

  it("yetkisiz öğrenci → 403", async () => {
    expect(
      (await exportPost(antalyaUni, "annual-activity-report", burak, { year: currentYear })).status
    ).toBe(403);
  });

  it("var olmayan başvuru → 404", async () => {
    const res = await exportPost(antalyaUni, "application-decision-minutes", sks, {
      applicationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(res.status).toBe(404);
  });

  it("başka tenant başvuru kimliği → 404", async () => {
    const egeApp = await db.query.clubApplications.findFirst({
      where: { universityId: egeUni, status: "rejected" },
      columns: { id: true },
    });
    expect(egeApp?.id).toBeTruthy();

    const res = await exportPost(antalyaUni, "application-decision-minutes", sks, {
      applicationId: egeApp!.id,
    });
    expect(res.status).toBe(404);
  });

  it("başka tenant genel kurul kimliği → 404", async () => {
    const clubId = await antalyaTechClubId();
    const meeting = await db.query.clubGeneralMeetings.findFirst({
      where: { universityId: antalyaUni, clubId },
      columns: { id: true },
    });
    expect(meeting?.id).toBeTruthy();

    const res = await exportPost(egeUni, "general-meeting-minutes", egeSks, {
      meetingId: meeting!.id,
    });
    expect(res.status).toBe(404);
  });

  it("başka tenant devir teslim kimliği → 404", async () => {
    const res = await exportPost(egeUni, "club-handover-minutes", egeSks, { handoverId });
    expect(res.status).toBe(404);
  });
});
