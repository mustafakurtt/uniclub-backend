import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { data, get, login, me, reqAuth } from "./helpers";
import { db } from "../src/db";
import { announcements } from "../src/db/schema";
import { NotificationType } from "../src/features/notifications/notifications.types";

describe("okul geneli duyurular (/api/universities/:universityId/announcements)", () => {
  let sks: string;
  let mustafa: string;
  let antalyaUniId: string;
  let egeStudent: string;
  let egeUniId: string;

  beforeAll(async () => {
    [sks, mustafa, egeStudent] = await Promise.all([
      login("sks@antalya.edu.tr"),
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("cem.arslan@std.egebilim.edu.tr"),
    ]);
    antalyaUniId = (await me(mustafa)).universityId!;
    egeUniId = (await me(egeStudent)).universityId!;
  });

  it("SKS okul geneli duyuru oluşturur; öğrenci listede ve feed'de görür", async () => {
    const title = `Okul geneli ${Date.now()}`;
    const createRes = await reqAuth(
      "POST",
      `/api/universities/${antalyaUniId}/announcements`,
      sks,
      { title, content: "Oryantasyon duyurusu.", publish: true }
    );
    expect(createRes.status).toBe(201);

    const list = await data<Array<{ title: string; clubId: string | null }>>(
      await get(`/api/universities/${antalyaUniId}/announcements`, mustafa)
    );
    expect(list.some((a) => a.title === title && a.clubId === null)).toBe(true);

    const feed = await data<{ items: Array<{ type: string; item: { title: string } }> }>(
      await get("/api/feed?limit=50", mustafa)
    );
    expect(
      feed.items.some((i) => i.type === "university_announcement" && i.item.title === title)
    ).toBe(true);
  });

  it("tenant izolasyonu: Ege öğrencisi Antalya okul duyurusunu listede görmez", async () => {
    const title = `Tenant izolasyon ${Date.now()}`;
    expect(
      (
        await reqAuth("POST", `/api/universities/${antalyaUniId}/announcements`, sks, {
          title,
          content: "Yalnızca Antalya.",
          publish: true,
        })
      ).status
    ).toBe(201);

    const egeList = await data<Array<{ title: string }>>(
      await get(`/api/universities/${egeUniId}/announcements`, egeStudent)
    );
    expect(egeList.some((a) => a.title === title)).toBe(false);
  });

  it("draft okul duyurusu öğrenciye görünmez, yetkili görür", async () => {
    const title = `Draft uni ${Date.now()}`;
    const createRes = await reqAuth(
      "POST",
      `/api/universities/${antalyaUniId}/announcements`,
      sks,
      { title, content: "Taslak.", publish: false }
    );
    expect(createRes.status).toBe(201);

    const studentList = await data<Array<{ title: string; status: string }>>(
      await get(`/api/universities/${antalyaUniId}/announcements`, mustafa)
    );
    expect(studentList.some((a) => a.title === title)).toBe(false);

    const staffList = await data<Array<{ title: string; status: string }>>(
      await get(`/api/universities/${antalyaUniId}/announcements`, sks)
    );
    expect(staffList.some((a) => a.title === title && a.status === "draft")).toBe(true);
  });

  it("yayınlanmış okul duyurusu detayda görünür; taslak öğrenciye 404", async () => {
    const publishedTitle = `Detay yayın ${Date.now()}`;
    const publishedRes = await reqAuth(
      "POST",
      `/api/universities/${antalyaUniId}/announcements`,
      sks,
      { title: publishedTitle, content: "Yayında.", publish: true }
    );
    expect(publishedRes.status).toBe(201);
    const published = await data<{ id: string; title: string }>(publishedRes);

    const studentDetail = await get(
      `/api/universities/${antalyaUniId}/announcements/${published.id}`,
      mustafa
    );
    expect(studentDetail.status).toBe(200);
    const studentBody = await data<{ id: string; title: string; status: string }>(studentDetail);
    expect(studentBody.id).toBe(published.id);
    expect(studentBody.title).toBe(publishedTitle);
    expect(studentBody.status).toBe("published");

    const draftTitle = `Detay taslak ${Date.now()}`;
    const draftRes = await reqAuth(
      "POST",
      `/api/universities/${antalyaUniId}/announcements`,
      sks,
      { title: draftTitle, content: "Taslak detay.", publish: false }
    );
    expect(draftRes.status).toBe(201);
    const draft = await data<{ id: string }>(draftRes);

    const studentDraft = await get(
      `/api/universities/${antalyaUniId}/announcements/${draft.id}`,
      mustafa
    );
    expect(studentDraft.status).toBe(404);

    const staffDraft = await get(
      `/api/universities/${antalyaUniId}/announcements/${draft.id}`,
      sks
    );
    expect(staffDraft.status).toBe(200);
    const staffBody = await data<{ id: string; status: string }>(staffDraft);
    expect(staffBody.id).toBe(draft.id);
    expect(staffBody.status).toBe("draft");
  });

  it("migration: club_id nullable; mevcut kulüp duyuruları clubId dolu", async () => {
    const clubRows = await db
      .select({ clubId: announcements.clubId })
      .from(announcements)
      .where(and(eq(announcements.status, "published"), isNotNull(announcements.clubId)))
      .limit(20);
    expect(clubRows.length).toBeGreaterThan(0);
    expect(clubRows.every((r) => r.clubId != null)).toBe(true);

    const uniRows = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(isNull(announcements.clubId))
      .limit(1);
    expect(uniRows.length).toBeGreaterThan(0);
  });
});
