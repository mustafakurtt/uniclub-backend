/**
 * Dönemsel devir teslim (T1.3).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { and, inArray, isNull } from "drizzle-orm";
import { login, me, get, reqAuth } from "./helpers";
import { db } from "../src/db";
import {
  clubBoardMemberships,
  clubGeneralMeetings,
  clubMembershipEvents,
  clubMembers,
} from "../src/db/schema";
import { antalyaTechClubId, antalyaUniversityId } from "./tenant-test-helpers";

const post = (path: string, token: string, body?: unknown) => reqAuth("POST", path, token, body);

describe("devir teslim (T1.3)", () => {
  let admin: string;
  let president: string;
  let officer: string;
  let student: string;
  let egeStudent: string;
  let antalyaUni: string;
  let photoClubId: string;
  let termId: string;
  let meetingId: string;
  let officerId: string;
  let presidentId: string;
  const suffix = Date.now();

  const handoverUrl = (clubId: string) => `/api/clubs/${clubId}/handover-records`;
  const meetingsUrl = (clubId: string) => `/api/clubs/${clubId}/general-meetings`;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr");
    president = await login("ayse.yilmaz@std.antalya.edu.tr");
    officer = await login("burak.demirci@std.antalya.edu.tr");
    student = await login("250803001@std.antalya.edu.tr");
    egeStudent = await login("cem.arslan@std.egebilim.edu.tr");
    antalyaUni = await antalyaUniversityId();
    presidentId = (await me(president)).userId as string;
    officerId = (await me(officer)).userId as string;

    const photo = await db.query.clubs.findFirst({
      where: { slug: "fotografcilik", universityId: antalyaUni },
    });
    if (!photo) throw new Error("seed eksik");
    photoClubId = photo.id;

    const y = 2300 + (suffix % 50);
    const termRes = await post(`/api/universities/${antalyaUni}/academic-terms`, admin, {
      name: `Devir-${suffix}`,
      startsAt: `${y}-01-01T00:00:00+03:00`,
      endsAt: `${y}-12-31T23:59:59+03:00`,
    });
    expect(termRes.status).toBe(201);
    termId = (await termRes.json()).data.id as string;

    const members = await db.query.clubMembers.findMany({
      where: { clubId: photoClubId, status: "approved", leftAt: { isNull: true } },
    });
    const attendeeIds = members.map((m) => m.userId);

    const gmRes = await post(meetingsUrl(photoClubId), president, {
      academicTermId: termId,
      meetingType: "ordinary",
      heldAt: `${y}-04-20T15:00:00+03:00`,
      location: "Fotoğrafçılık Atölyesi",
      decisions: "Yeni yönetim kurulu seçildi; devir teslim yapılacak.",
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
      ],
    });
    expect(gmRes.status).toBe(201);
    meetingId = (await gmRes.json()).data.id as string;
  });

  it("devir kaydı akademik dönem ve genel kurul kararına bağlanır", async () => {
    const res = await post(handoverUrl(photoClubId), president, {
      generalMeetingId: meetingId,
      handoverAt: `${2300 + (suffix % 50)}-04-21T10:00:00+03:00`,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()).data;
    expect(body.academicTerm?.id).toBe(termId);
    expect(body.generalMeeting?.id).toBe(meetingId);
    expect(body.outgoingBoard.length).toBeGreaterThan(0);
    expect(body.incomingBoard.length).toBe(3);
    expect(body.transferredItems.advisorUserIds.length).toBeGreaterThan(0);
  });

  it("eski kurul görev süresi kapanır, yeni kurul aktif kalır", async () => {
    const y = 2300 + (suffix % 50);
    const termRes = await post(`/api/universities/${antalyaUni}/academic-terms`, admin, {
      name: `Devir-Board-${suffix}`,
      startsAt: `${y + 1}-01-01T00:00:00+03:00`,
      endsAt: `${y + 1}-12-31T23:59:59+03:00`,
    });
    expect(termRes.status).toBe(201);
    const localTermId = (await termRes.json()).data.id as string;

    const oldActive = await db.query.clubBoardMemberships.findMany({
      where: { clubId: photoClubId, endedAt: { isNull: true } },
    });
    const oldIds = oldActive.map((r) => r.id);

    const [meeting] = await db
      .insert(clubGeneralMeetings)
      .values({
        clubId: photoClubId,
        universityId: antalyaUni,
        academicTermId: localTermId,
        meetingType: "ordinary",
        heldAt: new Date(`${y + 1}-05-01T12:00:00+03:00`),
        location: "Test Salon",
        decisions: "Kurul değişimi testi.",
        recordedBy: presidentId,
      })
      .returning();

    await db.insert(clubBoardMemberships).values([
      {
        clubId: photoClubId,
        universityId: antalyaUni,
        generalMeetingId: meeting.id,
        userId: presidentId,
        boardType: "management",
        seatType: "principal",
        title: "president",
      },
      {
        clubId: photoClubId,
        universityId: antalyaUni,
        generalMeetingId: meeting.id,
        userId: officerId,
        boardType: "audit",
        seatType: "principal",
        title: "member",
      },
    ]);

    const handoverRes = await post(handoverUrl(photoClubId), president, {
      generalMeetingId: meeting.id,
    });
    expect(handoverRes.status).toBe(201);

    if (oldIds.length > 0) {
      const endedOld = await db
        .select()
        .from(clubBoardMemberships)
        .where(inArray(clubBoardMemberships.id, oldIds));
      for (const row of endedOld) {
        expect(row.endedAt).not.toBeNull();
      }
    }

    const newActive = await db.query.clubBoardMemberships.findMany({
      where: { clubId: photoClubId, generalMeetingId: meeting.id, endedAt: { isNull: true } },
    });
    expect(newActive.length).toBe(2);
  });

  it("üyelik tarihçesinde rol değişimi olayları", async () => {
    const events = await db.query.clubMembershipEvents.findMany({
      where: {
        clubId: photoClubId,
        userId: officerId,
        eventType: "role_changed",
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].academicTermId).toBeTruthy();
  });

  it("transfer-presidency regresyonu", async () => {
    const techId = await antalyaTechClubId();
    const mustafa = await login("mustafa.kurt@std.antalya.edu.tr");
    const can = await login("can.ozturk@std.antalya.edu.tr");
    const mustafaId = (await me(mustafa)).userId as string;
    const canId = (await me(can)).userId as string;

    const presidentRow = await db.query.clubMembers.findFirst({
      where: {
        clubId: techId,
        role: "president",
        status: "approved",
        leftAt: { isNull: true },
      },
    });
    expect(presidentRow).toBeTruthy();

    if (presidentRow!.userId === mustafaId) {
      expect(
        (await post(`/api/clubs/${techId}/transfer-presidency`, mustafa, { newPresidentId: canId })).status
      ).toBe(200);
      await post(`/api/clubs/${techId}/transfer-presidency`, can, { newPresidentId: mustafaId });
    } else if (presidentRow!.userId === canId) {
      expect(
        (await post(`/api/clubs/${techId}/transfer-presidency`, can, { newPresidentId: mustafaId })).status
      ).toBe(200);
    }
  });

  it("yetkisiz öğrenci → 403", async () => {
    expect(
      (await post(handoverUrl(photoClubId), student, { generalMeetingId: meetingId })).status
    ).toBe(403);
  });

  it("çapraz tenant → 404", async () => {
    expect((await get(handoverUrl(photoClubId), egeStudent)).status).toBe(404);
  });
});
