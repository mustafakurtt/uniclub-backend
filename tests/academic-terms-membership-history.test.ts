/**
 * Akademik dönem (D1) ve üyelik tarihçesi (D2) — T9.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { login, me, get, reqAuth } from "./helpers";
import { db } from "../src/db";
import {
  clubMembers,
  clubMembershipEvents,
} from "../src/db/schema";

const post = (path: string, token: string, body?: unknown) => reqAuth("POST", path, token, body);
const patch = (path: string, token: string, body: unknown) => reqAuth("PATCH", path, token, body);
const del = (path: string, token: string) => reqAuth("DELETE", path, token);

describe("akademik dönemler", () => {
  let admin: string;
  let student: string;
  let antalyaUni: string;
  let egeUni: string;
  const suffix = Date.now();

  const termsUrl = (uni: string) => `/api/universities/${uni}/academic-terms`;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr");
    student = await login("250803001@std.antalya.edu.tr");
    antalyaUni = (await me(admin)).universityId as string;
    egeUni = (await me(await login("sks@egebilim.edu.tr"))).universityId as string;
  });

  it("yetkisiz öğrenci → 403", async () => {
    expect((await get(termsUrl(antalyaUni), student)).status).toBe(403);
  });

  it("çapraz tenant üniversite → 403", async () => {
    expect((await get(termsUrl(egeUni), admin)).status).toBe(403);
  });

  it("çakışan dönem oluşturma DB exclusion ile reddedilir", async () => {
    const y = 2050 + (suffix % 40);
    const body = {
      name: `Güz-${suffix}`,
      startsAt: `${y}-09-01T00:00:00+03:00`,
      endsAt: `${y + 1}-01-31T23:59:59+03:00`,
    };
    expect((await post(termsUrl(antalyaUni), admin, body)).status).toBe(201);

    const overlap = {
      name: `Çakışan-${suffix}`,
      startsAt: `${y}-11-01T00:00:00+03:00`,
      endsAt: `${y + 1}-06-30T23:59:59+03:00`,
    };
    expect((await post(termsUrl(antalyaUni), admin, overlap)).status).toBe(400);
  });

  it("aynı anda iki aktif dönem oluşamaz (çakışma engeli)", async () => {
    const y = 2090 + (suffix % 40);
    const first = {
      name: `Geniş-A-${suffix}`,
      startsAt: `${y}-01-01T00:00:00+03:00`,
      endsAt: `${y}-12-31T23:59:59+03:00`,
    };
    expect((await post(termsUrl(antalyaUni), admin, first)).status).toBe(201);

    const second = {
      name: `Geniş-B-${suffix}`,
      startsAt: `${y}-06-01T00:00:00+03:00`,
      endsAt: `${y + 1}-03-01T00:00:00+03:00`,
    };
    expect((await post(termsUrl(antalyaUni), admin, second)).status).toBe(400);
  });

  it("geçmişi olan dönem silinemez", async () => {
    const y = 2180 + (suffix % 20);
    const createRes = await post(termsUrl(antalyaUni), admin, {
      name: `Silinemez-${suffix}`,
      startsAt: `${y}-01-01T00:00:00+03:00`,
      endsAt: `${y}-06-01T00:00:00+03:00`,
    });
    expect(createRes.status).toBe(201);
    const term = (await createRes.json()).data as { id: string };

    const club = await db.query.clubs.findFirst({ where: { slug: "yazilim-teknoloji" } });
    const user = await db.query.users.findFirst({
      where: { email: "mustafa.kurt@std.antalya.edu.tr" },
    });
    if (!club || !user) throw new Error("seed eksik");

    await db.insert(clubMembershipEvents).values({
      clubId: club.id,
      userId: user.id,
      universityId: antalyaUni,
      eventType: "joined",
      role: "president",
      academicTermId: term.id,
      occurredAt: new Date(`${y}-02-01T00:00:00+03:00`),
    });

    expect(
      (await del(`/api/universities/${antalyaUni}/academic-terms/${term.id}`, admin)).status
    ).toBe(400);
  });
});

describe("üyelik tarihçesi", () => {
  let president: string;
  let student: string;
  let antalyaUni: string;
  let photoClubId: string;
  let techClubId: string;
  let egeClubId: string;

  beforeAll(async () => {
    president = await login("ayse.yilmaz@std.antalya.edu.tr");
    student = await login("250803001@std.antalya.edu.tr");
    antalyaUni = (await me(president)).universityId as string;

    const photo = await db.query.clubs.findFirst({ where: { slug: "fotografcilik" } });
    const tech = await db.query.clubs.findFirst({ where: { slug: "yazilim-teknoloji" } });
    const ege = await db.query.clubs.findFirst({
      where: { slug: "yazilim-teknoloji", universityId: (await me(await login("sks@egebilim.edu.tr"))).universityId as string },
    });
    photoClubId = photo!.id;
    techClubId = tech!.id;
    egeClubId = ege!.id;
  });

  const historyUrl = (clubId: string) => `/api/clubs/${clubId}/membership-history`;

  it("yetkisiz öğrenci (kulüp staff değil) → 403", async () => {
    expect((await get(historyUrl(photoClubId), student)).status).toBe(403);
  });

  it("çapraz tenant kulüp → 404", async () => {
    const admin = await login("elif.demir@antalya.edu.tr");
    expect((await get(historyUrl(egeClubId), admin)).status).toBe(404);
  });

  it("rol değişimi tarihçeye düşer; eski rol korunur", async () => {
    const burak = await db.query.users.findFirst({ where: { email: "burak.demirci@std.antalya.edu.tr" } });
    if (!burak) throw new Error("seed eksik");

    const res = await patch(`/api/clubs/${photoClubId}/members/${burak.id}/role`, president, {
      role: "officer",
    });
    expect(res.status).toBe(200);

    const event = await db.query.clubMembershipEvents.findFirst({
      where: {
        clubId: photoClubId,
        userId: burak.id,
        eventType: "role_changed",
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(event).toBeTruthy();
    expect(event!.previousRole).toBe("member");
    expect(event!.role).toBe("officer");

    // temizlik — geri al
    await patch(`/api/clubs/${photoClubId}/members/${burak.id}/role`, president, { role: "member" });
  });

  it("başkanlık devri → iki role_changed olayı", async () => {
    const mustafa = await login("mustafa.kurt@std.antalya.edu.tr");
    const can = await db.query.users.findFirst({ where: { email: "can.ozturk@std.antalya.edu.tr" } });
    if (!can) throw new Error("seed eksik");

    expect(
      (
        await post(`/api/clubs/${techClubId}/transfer-presidency`, mustafa, {
          newPresidentId: can.id,
        })
      ).status
    ).toBe(200);

    const events = await db.query.clubMembershipEvents.findMany({
      where: {
        clubId: techClubId,
        eventType: "role_changed",
      },
      orderBy: { occurredAt: "desc" },
      limit: 2,
    });

    expect(events.length).toBeGreaterThanOrEqual(2);
    const roles = events.slice(0, 2).map((e) => ({
      userId: e.userId,
      previousRole: e.previousRole,
      role: e.role,
    }));
    expect(roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ previousRole: "president", role: "officer" }),
        expect.objectContaining({ userId: can.id, role: "president" }),
      ])
    );

    // temizlik — devri geri al (yeni başkan devreder)
    const canToken = await login("can.ozturk@std.antalya.edu.tr");
    const mustafaId = (await me(mustafa)).userId;
    await post(`/api/clubs/${techClubId}/transfer-presidency`, canToken, {
      newPresidentId: mustafaId,
    });
  });

  it("backfill: aktif üyelikler için joined olayı var", async () => {
    const activeMembers = await db
      .select()
      .from(clubMembers)
      .where(and(eq(clubMembers.status, "approved"), isNull(clubMembers.leftAt)));

    expect(activeMembers.length).toBeGreaterThan(0);

    for (const row of activeMembers.slice(0, 20)) {
      const event = await db.query.clubMembershipEvents.findFirst({
        where: {
          clubId: row.clubId,
          userId: row.userId,
          eventType: "joined",
        },
      });
      expect(event).toBeTruthy();
    }
  });

  it("kulüp staff tarihçeyi listeleyebilir", async () => {
    const res = await get(historyUrl(photoClubId), president);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items.length).toBeGreaterThan(0);
  });
});
