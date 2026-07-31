import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { and, eq } from "drizzle-orm";
import { data, get, login, me, reqAuth } from "./helpers";
import { db } from "../src/db";
import { notifications, notificationMutes } from "../src/db/schema";
import { NotificationType } from "../src/features/notifications/notifications.types";
import * as mutesRepo from "../src/features/notifications/notification-mutes.repository";
import * as notificationsServiceModule from "../src/features/notifications/notifications.service";

async function countUserNotifications(userId: string, type: string) {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
  return rows.length;
}

async function countMutes(userId: string) {
  const rows = await db
    .select({ id: notificationMutes.id })
    .from(notificationMutes)
    .where(eq(notificationMutes.userId, userId));
  return rows.length;
}

describe("bildirim tercihleri (notification preferences)", () => {
  let mustafa: string;
  let sen: string;
  let can: string;
  let ayse: string;
  let burak: string;
  let senId: string;
  let canId: string;
  let burakId: string;
  let techClubId: string;
  let photoClubId: string;

  beforeAll(async () => {
    [mustafa, sen, can, ayse, burak] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("can.ozturk@std.antalya.edu.tr"),
      login("ayse.yilmaz@std.antalya.edu.tr"),
      login("burak.demirci@std.antalya.edu.tr"),
    ]);
    senId = (await me(sen)).userId;
    canId = (await me(can)).userId;
    burakId = (await me(burak)).userId;

    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
    photoClubId = clubs.find((c) => c.slug === "fotografcilik")!.id;
  });

  it("GET tercihler: susturmalar + susturulabilir tip kataloğu", async () => {
    const res = await get("/api/users/me/notification-preferences", sen);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.mutes)).toBe(true);
    expect(body.data.optOutableTypes.some((t: { type: string }) => t.type === NotificationType.ANNOUNCEMENT_PUBLISHED)).toBe(true);
    expect(body.data.optOutableTypes.some((t: { type: string }) => t.type === NotificationType.ACCOUNT_SUSPENDED)).toBe(false);
  });

  it("susturulamaz tip → 400", async () => {
    const res = await reqAuth("PUT", "/api/users/me/notification-preferences", sen, {
      type: NotificationType.ACCOUNT_SUSPENDED,
      muted: true,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("susturulamaz");
  });

  it("aynı kural iki kez yazıldığında tek satır (idempotent)", async () => {
    const before = await countMutes(senId);
    const body = {
      type: NotificationType.ACTIVITY_PUBLISHED,
      muted: true,
    };
    expect((await reqAuth("PUT", "/api/users/me/notification-preferences", sen, body)).status).toBe(200);
    expect((await reqAuth("PUT", "/api/users/me/notification-preferences", sen, body)).status).toBe(200);
    expect(await countMutes(senId)).toBe(before + 1);

    await reqAuth("PUT", "/api/users/me/notification-preferences", sen, {
      type: NotificationType.ACTIVITY_PUBLISHED,
      muted: false,
    });
  });

  it("tip bazlı susturma: duyuru susturulmuş kullanıcıya kayıt oluşmaz", async () => {
    const beforeSen = await countUserNotifications(senId, NotificationType.ANNOUNCEMENT_PUBLISHED);
    const beforeCan = await countUserNotifications(canId, NotificationType.ANNOUNCEMENT_PUBLISHED);

    expect(
      (
        await reqAuth("PUT", "/api/users/me/notification-preferences", sen, {
          type: NotificationType.ANNOUNCEMENT_PUBLISHED,
          muted: true,
        })
      ).status
    ).toBe(200);

    const title = `Tip mute ${Date.now()}`;
    expect(
      (
        await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
          title,
          content: "Susturma testi.",
          publish: true,
        })
      ).status
    ).toBe(201);

    expect(await countUserNotifications(senId, NotificationType.ANNOUNCEMENT_PUBLISHED)).toBe(beforeSen);
    expect(await countUserNotifications(canId, NotificationType.ANNOUNCEMENT_PUBLISHED)).toBeGreaterThan(beforeCan);

    await reqAuth("PUT", "/api/users/me/notification-preferences", sen, {
      type: NotificationType.ANNOUNCEMENT_PUBLISHED,
      muted: false,
    });
  });

  it("kulüp bazlı susturma: A susturulmuşken A'nın duyurusu gelmez, B'ninki gelir", async () => {
    const joinRes = await reqAuth("POST", `/api/clubs/${techClubId}/join`, burak);
    expect([201, 400]).toContain(joinRes.status); // 400 = zaten üye (önceki koşu)

    const beforeBurak = await countUserNotifications(burakId, NotificationType.ANNOUNCEMENT_PUBLISHED);

    expect(
      (
        await reqAuth("PUT", "/api/users/me/notification-preferences", burak, {
          clubId: photoClubId,
          muted: true,
        })
      ).status
    ).toBe(200);

    const photoTitle = `Kulüp mute photo ${Date.now()}`;
    expect(
      (
        await reqAuth("POST", `/api/clubs/${photoClubId}/announcements`, ayse, {
          title: photoTitle,
          content: "Foto kulüp.",
          publish: true,
        })
      ).status
    ).toBe(201);
    expect(await countUserNotifications(burakId, NotificationType.ANNOUNCEMENT_PUBLISHED)).toBe(beforeBurak);

    const techTitle = `Kulüp mute tech ${Date.now()}`;
    expect(
      (
        await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
          title: techTitle,
          content: "Tech kulüp.",
          publish: true,
        })
      ).status
    ).toBe(201);
    expect(await countUserNotifications(burakId, NotificationType.ANNOUNCEMENT_PUBLISHED)).toBeGreaterThan(
      beforeBurak
    );

    await reqAuth("PUT", "/api/users/me/notification-preferences", burak, {
      clubId: photoClubId,
      muted: false,
    });
  });

  it("kombinasyon: type+club susturması yalnızca kesişimi keser", async () => {
    const beforeSenAnn = await countUserNotifications(senId, NotificationType.ANNOUNCEMENT_PUBLISHED);
    const beforeSenAct = await countUserNotifications(senId, NotificationType.ACTIVITY_PUBLISHED);

    expect(
      (
        await reqAuth("PUT", "/api/users/me/notification-preferences", sen, {
          type: NotificationType.ANNOUNCEMENT_PUBLISHED,
          clubId: techClubId,
          muted: true,
        })
      ).status
    ).toBe(200);

    const annTitle = `Kombinasyon ann ${Date.now()}`;
    expect(
      (
        await reqAuth("POST", `/api/clubs/${techClubId}/announcements`, mustafa, {
          title: annTitle,
          content: "Duyuru susturuldu.",
          publish: true,
        })
      ).status
    ).toBe(201);
    expect(await countUserNotifications(senId, NotificationType.ANNOUNCEMENT_PUBLISHED)).toBe(beforeSenAnn);

    const startsAt = new Date(Date.now() + 8 * 864e5).toISOString();
    expect(
      (
        await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
          title: `Kombinasyon act ${Date.now()}`,
          startsAt,
          publish: true,
        })
      ).status
    ).toBe(201);
    expect(await countUserNotifications(senId, NotificationType.ACTIVITY_PUBLISHED)).toBeGreaterThan(
      beforeSenAct
    );

    await reqAuth("PUT", "/api/users/me/notification-preferences", sen, {
      type: NotificationType.ANNOUNCEMENT_PUBLISHED,
      clubId: techClubId,
      muted: false,
    });
  });

  it("fan-out: susturma sorgusu alıcı sayısından bağımsız tek çağrı", async () => {
    const findMutedSpy = spyOn(mutesRepo.notificationMutesRepository, "findMutedUserIds");
    const recipients = [senId, canId, burakId];
    await notificationsServiceModule.notificationsService.notifyManySafe(recipients, {
      type: NotificationType.ANNOUNCEMENT_PUBLISHED,
      title: "Fan-out test",
      body: "Ölçek testi",
      data: { clubId: techClubId },
    });
    expect(findMutedSpy.mock.calls.length).toBe(1);
    expect(findMutedSpy.mock.calls[0]![0].length).toBe(3);
    findMutedSpy.mockRestore();
  });
});
