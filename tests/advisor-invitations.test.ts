/**
 * Danışman davet ve kabul akışı (T1.2).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { login, me, get, reqAuth } from "./helpers";
import { db } from "../src/db";
import { clubAdvisors, clubAdvisorInvitations } from "../src/db/schema";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

const post = (path: string, token: string, body?: unknown) =>
  reqAuth("POST", path, token, body);

const del = (path: string, token: string) => reqAuth("DELETE", path, token);

describe("danışman davet akışı", () => {
  let antalyaUni: string;
  let adminToken: string;
  let ahmetHoca: string;
  let zeynepHoca: string;
  let theatreClubId: string;

  beforeAll(async () => {
    adminToken = await login("elif.demir@antalya.edu.tr");
    ahmetHoca = await login("ahmet.hoca@antalya.edu.tr");
    zeynepHoca = await login("zeynep.aydin@antalya.edu.tr");
    antalyaUni = (await me(adminToken)).universityId as string;

    const theatre = await db.query.clubs.findFirst({ where: { slug: "tiyatro" } });
    if (!theatre) throw new Error("seed eksik");
    theatreClubId = theatre.id;
  });

  it("davet → kabul → kulüpte danışman görünür", async () => {
    const inviteRes = await post(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken,
      { userId: (await me(ahmetHoca)).userId, message: "Lütfen danışmanlığı kabul edin." }
    );
    expect(inviteRes.status).toBe(201);
    const invitationId = (await inviteRes.json()).data.id as string;

    const beforeAdvisors = await get(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken
    );
    expect((await beforeAdvisors.json()).data.length).toBe(0);

    const acceptRes = await patch(`/api/users/me/advisor-invitations/${invitationId}/accept`, ahmetHoca);
    expect(acceptRes.status).toBe(200);

    const afterAdvisors = await get(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken
    );
    expect((await afterAdvisors.json()).data.length).toBe(1);

    const detail = await get(`/api/clubs/${theatreClubId}`, ahmetHoca);
    const detailBody = (await detail.json()).data;
    expect(detailBody.advisorVacant).toBe(false);
    expect(detailBody.advisors.length).toBe(1);
  });

  it("davet → ret → danışman yok, gerekçe kayıtlı", async () => {
    const inviteRes = await post(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken,
      { userId: (await me(zeynepHoca)).userId }
    );
    expect(inviteRes.status).toBe(201);
    const invitationId = (await inviteRes.json()).data.id as string;

    const declineRes = await patch(`/api/users/me/advisor-invitations/${invitationId}/decline`, zeynepHoca, {
      reason: "Bu dönem zamanım yok.",
    });
    expect(declineRes.status).toBe(200);

    const row = await db.query.clubAdvisorInvitations.findFirst({ where: { id: invitationId } });
    expect(row?.status).toBe("declined");
    expect(row?.declineReason).toContain("zamanım yok");

    const advisors = await db.query.clubAdvisors.findMany({
      where: { clubId: theatreClubId, userId: (await me(zeynepHoca)).userId, leftAt: { isNull: true } },
    });
    expect(advisors.length).toBe(0);
  });

  it("süre dolmuş davet kullanılamaz", async () => {
    const inviteRes = await post(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken,
      { userId: (await me(zeynepHoca)).userId }
    );
    expect(inviteRes.status).toBe(201);
    const invitationId = (await inviteRes.json()).data.id as string;

    const past = new Date();
    past.setDate(past.getDate() - 1);
    await db
      .update(clubAdvisorInvitations)
      .set({ expiresAt: past })
      .where(eq(clubAdvisorInvitations.id, invitationId));

    expect((await patch(`/api/users/me/advisor-invitations/${invitationId}/accept`, zeynepHoca)).status).toBe(400);
  });

  it("aynı kişiye ikinci açık davet → 400", async () => {
    const userId = (await me(zeynepHoca)).userId;
    const first = await post(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken,
      { userId }
    );
    expect(first.status).toBe(201);

    const second = await post(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken,
      { userId }
    );
    expect(second.status).toBe(400);
  });

  it("danışman çekilir → kulüp danışmansız duruma düşer", async () => {
    const detailBefore = await get(`/api/clubs/${theatreClubId}`, ahmetHoca);
    expect((await detailBefore.json()).data.advisorVacant).toBe(false);

    const withdrawRes = await post(`/api/users/me/advised-clubs/${theatreClubId}/withdraw`, ahmetHoca, {
      reason: "Başka görevlere odaklanacağım.",
    });
    expect(withdrawRes.status).toBe(200);

    const detailAfter = await get(`/api/clubs/${theatreClubId}`, ahmetHoca);
    expect((await detailAfter.json()).data.advisorVacant).toBe(true);

    const row = await db.query.clubAdvisors.findFirst({
      where: { clubId: theatreClubId, userId: (await me(ahmetHoca)).userId },
    });
    expect(row?.leftAt).not.toBeNull();
    expect(row?.leaveReason).toContain("odaklanacağım");
  });

  it("migration sonrası mevcut danışmanlar aktif", async () => {
    const active = await db.query.clubAdvisors.findMany({
      where: { leftAt: { isNull: true } },
    });
    expect(active.length).toBeGreaterThan(0);
  });

  it("yetkisiz öğrenci davet gönderemez → 403", async () => {
    const student = await login("mustafa.kurt@std.antalya.edu.tr");
    const res = await post(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      student,
      { userId: (await me(ahmetHoca)).userId }
    );
    expect(res.status).toBe(403);
  });

  it("çapraz tenant davet → 404", async () => {
    const egeAdvisor = await login("leyla.hoca@egebilim.edu.tr");
    const res = await post(
      `/api/admin/universities/${antalyaUni}/clubs/${theatreClubId}/advisors`,
      adminToken,
      { userId: (await me(egeAdvisor)).userId }
    );
    expect(res.status).toBe(404);
  });
});
