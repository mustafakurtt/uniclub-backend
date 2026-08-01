import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { get, login, reqAuth, data } from "./helpers";
import { db } from "../src/db";
import { announcements, activities } from "../src/db/schema";
import { announcementsService } from "../src/features/announcements/announcements.service";
import { activitiesService } from "../src/features/activities/activities.service";
import * as notificationsServiceModule from "../src/features/notifications/notifications.service";
import { reconcileScheduledPublishes } from "../src/shared/publishing/scheduled-publish.reconcile";
import {
  cancelScheduledPublish,
  hasScheduledPublishJob,
} from "../src/shared/publishing/scheduled-publish.queue";

const FUTURE_SCHEDULE = "2026-12-31T09:00";
const FUTURE_START = "2026-12-31T14:00:00.000Z";

describe("zamanlanmış yayın mutabakatı", () => {
  let mustafa: string;
  let techClubId: string;

  beforeAll(async () => {
    mustafa = await login("mustafa.kurt@std.antalya.edu.tr");
    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  it("kuyruk işi kaybolduğunda tarama yayınlar ve bildirim bir kez gider", async () => {
    const notifySpy = spyOn(notificationsServiceModule.notificationsService, "notifyManySafe");
    const title = `Reconcile publish ${Date.now()}`;

    const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
      title,
      content: "Mutabakat testi.",
      publish: false,
      scheduledPublishAtLocal: FUTURE_SCHEDULE,
    });
    expect(createRes.status).toBe(201);
    const announcementId = (await createRes.json()).data.id as string;

    await cancelScheduledPublish("announcement", announcementId);
    expect(await hasScheduledPublishJob("announcement", announcementId)).toBe(false);

    await db
      .update(announcements)
      .set({ scheduledPublishAt: new Date(Date.now() - 1000) })
      .where(eq(announcements.id, announcementId));

    await reconcileScheduledPublishes();

    const row = await db.query.announcements.findFirst({ where: { id: announcementId } });
    expect(row!.status).toBe("published");
    expect(row!.scheduledPublishAt).toBeNull();
    expect(notifySpy.mock.calls.length).toBe(1);

    await reconcileScheduledPublishes();
    expect(notifySpy.mock.calls.length).toBe(1);
    notifySpy.mockRestore();
  });

  it("vakti gelmemiş kayıt taramada yayınlanmaz; eksik iş yeniden kuyruğa alınır", async () => {
    const title = `Reconcile future ${Date.now()}`;
    const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
      title,
      content: "Gelecek mutabakat.",
      publish: false,
      scheduledPublishAtLocal: FUTURE_SCHEDULE,
    });
    expect(createRes.status).toBe(201);
    const announcementId = (await createRes.json()).data.id as string;

    await cancelScheduledPublish("announcement", announcementId);
    expect(await hasScheduledPublishJob("announcement", announcementId)).toBe(false);

    await reconcileScheduledPublishes();

    const row = await db.query.announcements.findFirst({ where: { id: announcementId } });
    expect(row!.status).toBe("draft");
    expect(await hasScheduledPublishJob("announcement", announcementId)).toBe(true);

    await reconcileScheduledPublishes();
    expect(await hasScheduledPublishJob("announcement", announcementId)).toBe(true);
  });

  it("kuyrukta iş varken tarama ikinci iş oluşturmaz", async () => {
    const createRes = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: `Reconcile idempotent ${Date.now()}`,
      startsAt: FUTURE_START,
      publish: false,
      scheduledPublishAtLocal: FUTURE_SCHEDULE,
    });
    expect(createRes.status).toBe(201);
    const activityId = (await createRes.json()).data.id as string;

    expect(await hasScheduledPublishJob("activity", activityId)).toBe(true);
    await reconcileScheduledPublishes();
    expect(await hasScheduledPublishJob("activity", activityId)).toBe(true);

    const row = await db.query.activities.findFirst({ where: { id: activityId } });
    expect(row!.status).toBe("draft");
  });
});
