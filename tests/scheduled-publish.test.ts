import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { get, login, reqAuth, data } from "./helpers";
import { db } from "../src/db";
import { announcements, activities } from "../src/db/schema";
import { announcementsService } from "../src/features/announcements/announcements.service";
import { activitiesService } from "../src/features/activities/activities.service";
import * as notificationsServiceModule from "../src/features/notifications/notifications.service";

const FUTURE_SCHEDULE = "2026-12-31T09:00";
const FUTURE_SCHEDULE_LATER = "2026-12-31T11:00";
const PAST_SCHEDULE = "2020-01-01T09:00";
const FUTURE_START = "2026-12-31T14:00:00.000Z";

describe("zamanlanmış yayın (T2.1)", () => {
  let mustafa: string;
  let sen: string;
  let techClubId: string;

  beforeAll(async () => {
    [mustafa, sen] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
    ]);
    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  describe("duyurular", () => {
    it("geçmişe dönük zamanlama 400", async () => {
      const res = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
        title: `Past schedule ${Date.now()}`,
        content: "Geçmiş zaman.",
        publish: false,
        scheduledPublishAtLocal: PAST_SCHEDULE,
      });
      expect(res.status).toBe(400);
    });

    it("zamanlanmış taslak üyeye ve feed'de görünmez", async () => {
      const title = `Scheduled draft ${Date.now()}`;
      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
        title,
        content: "Henüz yayınlanmadı.",
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);
      const body = await createRes.json();
      expect(body.data.status).toBe("draft");

      const memberList = await data<Array<{ title: string }>>(
        await get(`/api/clubs/${techClubId}/announcements`, sen)
      );
      expect(memberList.some((a) => a.title === title)).toBe(false);

      const feed = await data<{ items: Array<{ type: string; item: { title: string } }> }>(
        await get("/api/feed?limit=50", mustafa)
      );
      expect(
        feed.items.some((i) => i.type === "announcement" && i.item.title === title)
      ).toBe(false);
    });

    it("zamanı gelince yayınlanır, publishedAt set edilir, bildirim bir kez gider", async () => {
      const notifySpy = spyOn(notificationsServiceModule.notificationsService, "notifyManySafe");
      const title = `Scheduled publish ${Date.now()}`;

      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
        title,
        content: "Zamanlanmış yayın.",
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);
      const announcementId = (await createRes.json()).data.id as string;
      expect(notifySpy.mock.calls.length).toBe(0);

      await db
        .update(announcements)
        .set({ scheduledPublishAt: new Date(Date.now() - 1000) })
        .where(eq(announcements.id, announcementId));

      await announcementsService.publishScheduled(announcementId);

      const row = await db.query.announcements.findFirst({ where: { id: announcementId } });
      expect(row!.status).toBe("published");
      expect(row!.publishedAt).not.toBeNull();
      expect(row!.scheduledPublishAt).toBeNull();
      expect(notifySpy.mock.calls.length).toBe(1);

      await announcementsService.publishScheduled(announcementId);
      expect(notifySpy.mock.calls.length).toBe(1);
      notifySpy.mockRestore();
    });

    it("zaman değişince erken tetikleme yayınlamaz", async () => {
      const title = `Reschedule ${Date.now()}`;
      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
        title,
        content: "Yeniden zamanlama.",
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);
      const announcementId = (await createRes.json()).data.id as string;

      const patchRes = await reqAuth(
        "PATCH",
        `/api/clubs/${techClubId}/announcements/${announcementId}`,
        mustafa,
        { scheduledPublishAtLocal: FUTURE_SCHEDULE_LATER }
      );
      expect(patchRes.status).toBe(200);

      await announcementsService.publishScheduled(announcementId);

      const row = await db.query.announcements.findFirst({ where: { id: announcementId } });
      expect(row!.status).toBe("draft");
      expect(row!.scheduledPublishAt).not.toBeNull();
    });

    it("iptal edince yayınlanmaz", async () => {
      const title = `Cancel schedule ${Date.now()}`;
      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
        title,
        content: "İptal testi.",
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);
      const announcementId = (await createRes.json()).data.id as string;

      const patchRes = await reqAuth(
        "PATCH",
        `/api/clubs/${techClubId}/announcements/${announcementId}`,
        mustafa,
        { scheduledPublishAtLocal: null }
      );
      expect(patchRes.status).toBe(200);

      await announcementsService.publishScheduled(announcementId);

      const row = await db.query.announcements.findFirst({ where: { id: announcementId } });
      expect(row!.status).toBe("draft");
      expect(row!.scheduledPublishAt).toBeNull();
    });
  });

  describe("etkinlikler", () => {
    it("geçmişe dönük zamanlama 400", async () => {
      const res = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title: `Past activity schedule ${Date.now()}`,
        startsAt: FUTURE_START,
        publish: false,
        scheduledPublishAtLocal: PAST_SCHEDULE,
      });
      expect(res.status).toBe(400);
    });

    it("zamanlanmış taslak keşif listesinde görünmez", async () => {
      const title = `Scheduled activity ${Date.now()}`;
      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title,
        startsAt: FUTURE_START,
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);

      const list = await data<Array<{ title: string }>>(
        await get("/api/activities?scope=upcoming", mustafa)
      );
      expect(list.some((a) => a.title === title)).toBe(false);
    });

    it("zamanı gelince yayınlanır ve bildirim bir kez gider", async () => {
      const notifySpy = spyOn(notificationsServiceModule.notificationsService, "notifyManySafe");
      const title = `Scheduled activity publish ${Date.now()}`;

      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title,
        startsAt: FUTURE_START,
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);
      const activityId = (await createRes.json()).data.id as string;
      expect(notifySpy.mock.calls.length).toBe(0);

      await db
        .update(activities)
        .set({ scheduledPublishAt: new Date(Date.now() - 1000) })
        .where(eq(activities.id, activityId));

      await activitiesService.publishScheduled(activityId);

      const row = await db.query.activities.findFirst({ where: { id: activityId } });
      expect(row!.status).toBe("published");
      expect(row!.scheduledPublishAt).toBeNull();
      expect(notifySpy.mock.calls.length).toBe(1);

      await activitiesService.publishScheduled(activityId);
      expect(notifySpy.mock.calls.length).toBe(1);
      notifySpy.mockRestore();
    });

    it("zaman değişince erken tetikleme yayınlamaz", async () => {
      const title = `Activity reschedule ${Date.now()}`;
      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title,
        startsAt: FUTURE_START,
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);
      const activityId = (await createRes.json()).data.id as string;

      const patchRes = await reqAuth(
        "PATCH",
        `/api/clubs/${techClubId}/activities/${activityId}`,
        mustafa,
        { scheduledPublishAtLocal: FUTURE_SCHEDULE_LATER }
      );
      expect(patchRes.status).toBe(200);

      await activitiesService.publishScheduled(activityId);

      const row = await db.query.activities.findFirst({ where: { id: activityId } });
      expect(row!.status).toBe("draft");
      expect(row!.scheduledPublishAt).not.toBeNull();
    });

    it("iptal edince yayınlanmaz", async () => {
      const title = `Cancel activity schedule ${Date.now()}`;
      const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title,
        startsAt: FUTURE_START,
        publish: false,
        scheduledPublishAtLocal: FUTURE_SCHEDULE,
      });
      expect(createRes.status).toBe(201);
      const activityId = (await createRes.json()).data.id as string;

      const patchRes = await reqAuth(
        "PATCH",
        `/api/clubs/${techClubId}/activities/${activityId}`,
        mustafa,
        { scheduledPublishAtLocal: null }
      );
      expect(patchRes.status).toBe(200);

      await activitiesService.publishScheduled(activityId);

      const row = await db.query.activities.findFirst({ where: { id: activityId } });
      expect(row!.status).toBe("draft");
      expect(row!.scheduledPublishAt).toBeNull();
    });
  });
});
