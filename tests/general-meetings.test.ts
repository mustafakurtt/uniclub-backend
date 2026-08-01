/**
 * Genel kurul temeli (T1.6 ADIM 1).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { isNull } from "drizzle-orm";
import { login, me, get, reqAuth } from "./helpers";
import { db } from "../src/db";
import {
  clubBoardMemberships,
  clubMembershipEvents,
  clubMembers,
} from "../src/db/schema";
import { antalyaTechClubId, antalyaUniversityId } from "./tenant-test-helpers";

const post = (path: string, token: string, body?: unknown) => reqAuth("POST", path, token, body);

describe("genel kurul temeli", () => {
  let admin: string;
  let president: string;
  let officer: string;
  let student: string;
  let antalyaUni: string;
  let egeStudent: string;
  let photoClubId: string;
  let termId: string;
  const suffix = Date.now();

  const meetingsUrl = (clubId: string) => `/api/clubs/${clubId}/general-meetings`;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr");
    president = await login("ayse.yilmaz@std.antalya.edu.tr");
    officer = await login("burak.demirci@std.antalya.edu.tr");
    student = await login("250803001@std.antalya.edu.tr");
    egeStudent = await login("cem.arslan@std.egebilim.edu.tr");
    antalyaUni = await antalyaUniversityId();

    const photo = await db.query.clubs.findFirst({
      where: { slug: "fotografcilik", universityId: antalyaUni },
    });
    if (!photo) throw new Error("seed eksik");
    photoClubId = photo.id;

    const y = 2200 + (suffix % 50);
    const termRes = await post(`/api/universities/${antalyaUni}/academic-terms`, admin, {
      name: `GK-${suffix}`,
      startsAt: `${y}-01-01T00:00:00+03:00`,
      endsAt: `${y}-12-31T23:59:59+03:00`,
    });
    expect(termRes.status).toBe(201);
    termId = (await termRes.json()).data.id as string;
  });

  it("genel kurul kaydı oluşturulur ve döneme bağlanır", async () => {
    const presidentId = (await me(president)).userId as string;
    const officerId = (await me(officer)).userId as string;

    const members = await db.query.clubMembers.findMany({
      where: { clubId: photoClubId, status: "approved", leftAt: { isNull: true } },
    });
    const attendeeIds = members.map((m) => m.userId);

    const res = await post(meetingsUrl(photoClubId), president, {
      academicTermId: termId,
      meetingType: "ordinary",
      heldAt: `${2200 + (suffix % 50)}-03-15T14:00:00+03:00`,
      location: "Öğrenci Merkezi Salon A",
      decisions: "Yönetim ve denetleme kurulu seçildi.",
      attendeeUserIds: attendeeIds,
      boardMembers: [
        {
          userId: officerId,
          boardType: "management",
          seatType: "principal",
          title: "president",
        },
        {
          userId: presidentId,
          boardType: "management",
          seatType: "principal",
          title: "vice_president",
        },
        {
          userId: officerId,
          boardType: "audit",
          seatType: "principal",
          title: "member",
        },
        {
          userId: presidentId,
          boardType: "audit",
          seatType: "alternate",
          title: "member",
        },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()).data;
    expect(body.academicTerm?.id).toBe(termId);
    expect(body.quorumMet).toBe(true);
    expect(body.boardMembers.length).toBe(4);

    const principalAudit = body.boardMembers.find(
      (b: { boardType: string; seatType: string }) =>
        b.boardType === "audit" && b.seatType === "principal"
    );
    const alternateAudit = body.boardMembers.find(
      (b: { boardType: string; seatType: string }) =>
        b.boardType === "audit" && b.seatType === "alternate"
    );
    expect(principalAudit).toBeTruthy();
    expect(alternateAudit).toBeTruthy();
  });

  it("kurul seçimi üyelik tarihçesine düşer", async () => {
    const officerId = (await me(officer)).userId as string;
    const events = await db.query.clubMembershipEvents.findMany({
      where: {
        clubId: photoClubId,
        userId: officerId,
        eventType: "role_changed",
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(events.length).toBeGreaterThan(0);
    const latest = events[0];
    expect(latest.role).toBe("president");
    expect(latest.academicTermId).toBeTruthy();
  });

  it("asil/yedek ayrımı veritabanında korunur", async () => {
    const rows = await db.query.clubBoardMemberships.findMany({
      where: { clubId: photoClubId, endedAt: { isNull: true } },
    });
    expect(rows.some((r) => r.boardType === "audit" && r.seatType === "principal")).toBe(true);
    expect(rows.some((r) => r.boardType === "audit" && r.seatType === "alternate")).toBe(true);
  });

  it("transfer-presidency regresyonu", async () => {
    const tech = await db.query.clubs.findFirst({ where: { slug: "yazilim-teknoloji" } });
    if (!tech) throw new Error("seed eksik");
    const mustafa = await login("mustafa.kurt@std.antalya.edu.tr");
    const can = await login("can.ozturk@std.antalya.edu.tr");
    const mustafaId = (await me(mustafa)).userId as string;
    const canId = (await me(can)).userId as string;

    const presidentRow = await db.query.clubMembers.findFirst({
      where: {
        clubId: tech.id,
        role: "president",
        status: "approved",
        leftAt: { isNull: true },
      },
    });
    expect(presidentRow).toBeTruthy();

    if (presidentRow!.userId === mustafaId) {
      expect(
        (await post(`/api/clubs/${tech.id}/transfer-presidency`, mustafa, { newPresidentId: canId })).status
      ).toBe(200);
      await post(`/api/clubs/${tech.id}/transfer-presidency`, can, { newPresidentId: mustafaId });
    } else if (presidentRow!.userId === canId) {
      expect(
        (await post(`/api/clubs/${tech.id}/transfer-presidency`, can, { newPresidentId: mustafaId })).status
      ).toBe(200);
    }
  });

  it("yetkisiz öğrenci → 403 (genel kurul listesi)", async () => {
    expect((await get(meetingsUrl(photoClubId), student)).status).toBe(403);
  });

  it("onaylı üye güncel kurulu görebilir, genel kurul listesine erişemez", async () => {
    const techId = await antalyaTechClubId();
    const currentBoardUrl = `/api/clubs/${techId}/current-board`;

    expect((await get(currentBoardUrl, student)).status).toBe(200);
    expect((await get(meetingsUrl(techId), student)).status).toBe(403);

    const body = await (await get(currentBoardUrl, student)).json();
    expect(body.data.management.principal.length).toBe(5);
    expect(body.data.management.alternate.length).toBe(5);
  });

  it("staff genel kurul listesinde attendeeCount görür", async () => {
    const techId = await antalyaTechClubId();
    const mustafa = await login("mustafa.kurt@std.antalya.edu.tr");
    const res = await get(meetingsUrl(techId), mustafa);
    expect(res.status).toBe(200);
    const meetings = (await res.json()).data as Array<{ attendeeCount: number }>;
    expect(meetings.length).toBeGreaterThan(0);
    expect(meetings[0].attendeeCount).toBeGreaterThan(0);
  });

  it("çapraz tenant kulüp → 404", async () => {
    expect((await get(meetingsUrl(photoClubId), egeStudent)).status).toBe(404);
  });
});
