import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { data, get, login, me, reqAuth } from "./helpers";
import { db } from "../src/db";
import { clubs } from "../src/db/schema";

describe("kulüpler (/api/clubs)", () => {
  let mustafa: string;
  let can: string;
  let sen: string;
  let ayse: string;
  let burak: string;
  let emre: string;
  let elif: string;
  let ahmetHoca: string;
  let antalyaUni: string;
  let techClubId: string;
  let photoClubId: string;
  let robotikClubId: string;
  let muzikClubId: string;

  beforeAll(async () => {
    [mustafa, can, sen, ayse, burak, emre, elif, ahmetHoca] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("can.ozturk@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("ayse.yilmaz@std.antalya.edu.tr"),
      login("burak.demirci@std.antalya.edu.tr"),
      login("emre.aksoy@std.antalya.edu.tr"),
      login("elif.demir@antalya.edu.tr"),
      login("ahmet.hoca@antalya.edu.tr"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;

    const clubRows = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubRows.find((c) => c.slug === "yazilim-teknoloji")!.id;
    photoClubId = clubRows.find((c) => c.slug === "fotografcilik")!.id;
    muzikClubId = clubRows.find((c) => c.slug === "muzik")!.id;

    const robotik = await db.query.clubs.findFirst({ where: { slug: "robotik" } });
    robotikClubId = robotik!.id;
  });

  it("joinPolicy open: katılım anında approved", async () => {
    const selin = await login("selin.koc@std.antalya.edu.tr");
    const res = await reqAuth("POST", `/api/clubs/${muzikClubId}/join`, selin);
    expect(res.status).toBe(201);
    expect((await res.json()).data.status).toBe("approved");
  });

  it("joinPolicy approval_required: katılım pending kalır; staff onayı ile approved", async () => {
    const selin = await login("selin.koc@std.antalya.edu.tr");
    const joinRes = await reqAuth("POST", `/api/clubs/${photoClubId}/join`, selin);
    expect(joinRes.status).toBe(201);
    expect((await joinRes.json()).data.status).toBe("pending");

    const approveRes = await reqAuth("PATCH", `/api/clubs/${photoClubId}/join-requests/${(await me(selin)).userId}`, ayse, {
      decision: "approved",
    });
    expect(approveRes.status).toBe(200);
    expect((await approveRes.json()).data.status).toBe("approved");
  });

  it("kulüp-içi roller: düz üye duyuru yazamaz, officer yazabilir", async () => {
    expect(
      (await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, sen, {
        title: `Üye duyuru ${Date.now()}`,
        content: "Üye yazamaz.",
        publish: true,
      })).status
    ).toBe(403);

    expect(
      (await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, can, {
        title: `Officer duyuru ${Date.now()}`,
        content: "Officer yazabilir.",
        publish: true,
      })).status
    ).toBe(201);
  });

  it("danışman: staff listesi görebilir, officer kararı veremez", async () => {
    expect((await get(`/api/clubs/${techClubId}/join-requests`, ahmetHoca)).status).toBe(200);

    const joinRes = await reqAuth("POST", `/api/clubs/${photoClubId}/join`, emre);
    expect(joinRes.status).toBe(201);
    expect((await joinRes.json()).data.status).toBe("pending");

    expect(
      (
        await reqAuth("PATCH", `/api/clubs/${photoClubId}/join-requests/${(await me(emre)).userId}`, ahmetHoca, {
          decision: "approved",
        })
      ).status
    ).toBe(403);
  });

  it("danışman atama/kaldırma (admin)", async () => {
    const theatre = await db.query.clubs.findFirst({ where: { slug: "tiyatro" } });
    if (!theatre) throw new Error("seed'de tiyatro kulübü yok");

    expect(
      (
        await reqAuth("POST", `/api/admin/universities/${antalyaUni}/clubs/${theatre.id}/advisors`, elif, {
          userId: (await me(ahmetHoca)).userId,
        })
      ).status
    ).toBe(201);

    expect(
      (
        await reqAuth(
          "DELETE",
          `/api/admin/universities/${antalyaUni}/clubs/${theatre.id}/advisors/${(await me(ahmetHoca)).userId}`,
          elif
        )
      ).status
    ).toBe(200);
  });

  it("kulüp kurma başvurusu reddi kulüp yaratmaz", async () => {
    const proposedName = `Red Test Kulüp ${Date.now()}`;
    const createRes = await reqAuth("POST", "/api/clubs/applications", emre, {
      proposedName,
      description: "Red akışı test başvurusu.",
    });
    expect(createRes.status).toBe(201);
    const applicationId = (await createRes.json()).data.id as string;

    expect(
      (
        await reqAuth("PATCH", `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/reject`, elif, {
          note: "Test ret gerekçesi — kulüp oluşturulmamalı.",
        })
      ).status
    ).toBe(200);

    const createdClub = await db
      .select({ id: clubs.id })
      .from(clubs)
      .where(and(eq(clubs.universityId, antalyaUni), eq(clubs.name, proposedName)));
    expect(createdClub.length).toBe(0);
  });

  it("durum: archived/rejected keşifte yok; archived'e katılım reddedilir", async () => {
    const slugs = (await data<Array<{ slug: string }>>(await get("/api/clubs", mustafa))).map((c) => c.slug);
    expect(slugs).not.toContain("robotik");
    expect(slugs).not.toContain("e-spor");

    expect((await reqAuth("POST", `/api/clubs/${robotikClubId}/join`, burak)).status).toBe(400);
  });

  it("tenant izolasyonu: başka üniversite öğrencisi Antalya kulübüne erişemez", async () => {
    const cem = await login("cem.arslan@std.egebilim.edu.tr");
    expect((await get(`/api/clubs/${techClubId}`, cem)).status).toBe(404);
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/join`, cem)).status).toBe(404);
  });

  it("başkanlık devri: yetki yeni başkana geçer", async () => {
    const transferRes = await reqAuth("POST", `/api/clubs/${techClubId}/transfer-presidency`, mustafa, {
      newPresidentId: (await me(can)).userId,
    });
    expect(transferRes.status).toBe(200);

    const canMembership = await db.query.clubMembers.findFirst({
      where: { clubId: techClubId, userId: (await me(can)).userId, leftAt: { isNull: true } },
    });
    expect(canMembership?.role).toBe("president");

    const mustafaMembership = await db.query.clubMembers.findFirst({
      where: { clubId: techClubId, userId: (await me(mustafa)).userId, leftAt: { isNull: true } },
    });
    expect(mustafaMembership?.role).toBe("officer");

    expect(
      (await reqAuth("POST", `/api/clubs/${techClubId}/transfer-presidency`, mustafa, {
        newPresidentId: (await me(sen)).userId,
      })).status
    ).toBe(403);
  });
});
