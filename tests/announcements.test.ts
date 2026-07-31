import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { data, get, login, reqAuth } from "./helpers";
import { db } from "../src/db";
import * as notificationsServiceModule from "../src/features/notifications/notifications.service";

describe("duyurular (/api/clubs/:clubId/announcements)", () => {
  let mustafa: string;
  let sen: string;
  let ayse: string;
  let burak: string;
  let techClubId: string;
  let photoClubId: string;

  beforeAll(async () => {
    [mustafa, sen, ayse, burak] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("ayse.yilmaz@std.antalya.edu.tr"),
      login("burak.demirci@std.antalya.edu.tr"),
    ]);
    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
    photoClubId = clubs.find((c) => c.slug === "fotografcilik")!.id;
  });

  it("migration backfill: seed duyuruları published ve publishedAt dolu", async () => {
    const seedTitles = ["Kulübümüze Hoş Geldiniz!", "Tanışma Toplantısı", "Teknofest Takım Seçmeleri"];
    for (const title of seedTitles) {
      const row = await db.query.announcements.findFirst({ where: { title } });
      expect(row).toBeDefined();
      expect(row!.status).toBe("published");
      expect(row!.publishedAt).not.toBeNull();
    }
  });

  it("members görünürlüğü: üye olmayan kulüp listesinde görmez", async () => {
    const title = `Members-only test ${Date.now()}`;
    const createRes = await reqAuth("POST", `/api/clubs/${photoClubId}/announcements`, ayse, {
      title,
      content: "Yalnızca üyelere.",
      visibility: "members",
      publish: true,
    });
    expect(createRes.status).toBe(201);

    const outsiderList = await data<Array<{ title: string }>>(
      await get(`/api/clubs/${photoClubId}/announcements`, mustafa)
    );
    expect(outsiderList.some((a) => a.title === title)).toBe(false);

    const memberList = await data<Array<{ title: string }>>(
      await get(`/api/clubs/${photoClubId}/announcements`, burak)
    );
    expect(memberList.some((a) => a.title === title)).toBe(true);
  });

  it("draft duyuru üyeye görünmez, staff görür", async () => {
    const title = `Draft test ${Date.now()}`;
    const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
      title,
      content: "Taslak içerik.",
      publish: false,
    });
    expect(createRes.status).toBe(201);

    const memberList = await data<Array<{ title: string }>>(
      await get(`/api/clubs/${techClubId}/announcements`, sen)
    );
    expect(memberList.some((a) => a.title === title)).toBe(false);

    const staffList = await data<Array<{ title: string; status: string }>>(
      await get(`/api/clubs/${techClubId}/announcements`, mustafa)
    );
    expect(staffList.some((a) => a.title === title && a.status === "draft")).toBe(true);
  });

  it("draft duyuru feed'e düşmez", async () => {
    const title = `Feed draft ${Date.now()}`;
    await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
      title,
      content: "Feed'te görünmemeli.",
      publish: false,
    });

    const feed = await data<{ items: Array<{ type: string; item: { title: string } }> }>(
      await get("/api/feed?limit=50", mustafa)
    );
    const inFeed = feed.items.some((i) => i.type === "announcement" && i.item.title === title);
    expect(inFeed).toBe(false);
  });

  it("yayın bildirimi yalnızca ilk publish'te gider", async () => {
    const notifySpy = spyOn(notificationsServiceModule.notificationsService, "notifySafe");

    const title = `Notify once ${Date.now()}`;
    const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
      title,
      content: "Taslak → yayın.",
      publish: false,
    });
    expect(createRes.status).toBe(201);
    const announcementId = (await createRes.json()).data.id as string;
    expect(notifySpy.mock.calls.length).toBe(0);

    const publishRes = await reqAuth(
      "POST",
      `/api/clubs/${techClubId}/announcements/${announcementId}/publish`,
      mustafa
    );
    expect(publishRes.status).toBe(200);
    expect(notifySpy.mock.calls.length).toBeGreaterThan(0);

    const secondPublish = await reqAuth(
      "POST",
      `/api/clubs/${techClubId}/announcements/${announcementId}/publish`,
      mustafa
    );
    expect(secondPublish.status).toBe(400);
    expect(notifySpy.mock.calls.length).toBeGreaterThan(0);

    notifySpy.mockRestore();
  });

  it("sabitleme üst sınırı kulüp başına 3", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await reqAuth("POST", `/api/clubs/${photoClubId}/announcements`, ayse, {
        title: `Pin limit ${Date.now()}-${i}`,
        content: "Sabitleme testi.",
        pinned: true,
        publish: true,
      });
      expect(res.status).toBe(201);
    }

    const over = await reqAuth("POST", `/api/clubs/${photoClubId}/announcements`, ayse, {
      title: `Pin limit overflow ${Date.now()}`,
      content: "Dördüncü sabitlenmiş duyuru.",
      pinned: true,
      publish: true,
    });
    expect(over.status).toBe(400);
  });
});
