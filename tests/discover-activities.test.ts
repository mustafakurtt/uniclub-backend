/**
 * T10.4 — üniversiteler arası etkinlik keşfi (`GET /api/discover/activities`).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { login, me, reqAuth, get, data } from "./helpers";
import { db } from "../src/db";
import { activities } from "../src/db/schema";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";

type DiscoverPage = {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

describe("üniversiteler arası etkinlik keşfi", () => {
  let mustafa: string;
  let cem: string;
  let antalyaSks: string;
  let superAdmin: string;
  let antalyaUni: string;
  let egeUni: string;
  let techClubId: string;
  let egeTechClubId: string;

  const settingsPath = (uni: string) => `/api/universities/${uni}/settings`;
  const discoverPath = "/api/discover/activities";

  beforeAll(async () => {
    [mustafa, cem, antalyaSks, superAdmin] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("cem.arslan@std.egebilim.edu.tr"),
      login("sks@antalya.edu.tr"),
      login("superadmin@platform.local"),
    ]);

    antalyaUni = (await me(mustafa)).universityId as string;
    egeUni = (await me(cem)).universityId as string;

    const antalyaClubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = antalyaClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;

    const egeClubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", cem));
    egeTechClubId = egeClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  afterAll(async () => {
    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED]: true },
    });
    await reqAuth("PATCH", settingsPath(egeUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED]: true },
    });
  });

  it("bayrak kapalı tenant kullanıcısı discover listesini göremez (404)", async () => {
    const off = await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED]: false },
    });
    expect(off.status).toBe(200);
    expect((await get(discoverPath, mustafa)).status).toBe(404);

    const on = await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED]: true },
    });
    expect(on.status).toBe(200);
  });

  it("university ve members görünürlüklü etkinlikler listede yok", async () => {
    const page = await data<DiscoverPage>(await get(discoverPath, mustafa));
    const titles = page.items.map((i) => i.title as string);
    expect(titles).not.toContain("React ile Web Atölyesi");
    expect(titles).not.toContain("Üyelere Özel Karanlık Oda Atölyesi");
  });

  it("yanıtta kullanıcı / RSVP / katılımcı alanı yok", async () => {
    const page = await data<DiscoverPage>(await get(discoverPath, mustafa));
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item).not.toHaveProperty("goingCount");
      expect(item).not.toHaveProperty("myRsvp");
      expect(item).not.toHaveProperty("attendees");
      expect(item).not.toHaveProperty("creator");
      expect(item).not.toHaveProperty("createdBy");
      expect(item).not.toHaveProperty("capacity");
      expect(item.hostClub).toEqual(expect.objectContaining({ name: expect.any(String) }));
      expect(Object.keys(item.hostClub as object)).toEqual(["name"]);
      expect(item.university).toEqual(
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) })
      );
    }
  });

  it("kendi üniversitesinin etkinlikleri listede yok", async () => {
    const page = await data<DiscoverPage>(await get(discoverPath, mustafa));
    const titles = page.items.map((i) => i.title as string);
    expect(titles).not.toContain("Antalya Ağ Etkinliği (Keşifte Görünmez)");
    expect(titles).toContain("Ege Açık Teknoloji Buluşması");
  });

  it("bayrak kapalı host tenant etkinliği listede yok", async () => {
    const off = await reqAuth("PATCH", settingsPath(egeUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED]: false },
    });
    expect(off.status).toBe(200);

    const page = await data<DiscoverPage>(await get(discoverPath, mustafa));
    const titles = page.items.map((i) => i.title as string);
    expect(titles).not.toContain("Ege Açık Teknoloji Buluşması");

    const on = await reqAuth("PATCH", settingsPath(egeUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_INTER_UNIVERSITY_ENABLED]: true },
    });
    expect(on.status).toBe(200);
  });

  it("keyset sayfalama eşit startsAt'te satır atlamaz", async () => {
    const sameStart = new Date(Date.now() + 18 * 24 * 60 * 60 * 1000);
    const titles = ["Keşif Keyset A", "Keşif Keyset B", "Keşif Keyset C"];
    const createdIds: string[] = [];

    for (const title of titles) {
      const res = await reqAuth("POST", `/api/clubs/${egeTechClubId}/activities`, cem, {
        title,
        startsAt: sameStart.toISOString(),
        visibility: "inter_university",
        publish: true,
      });
      expect(res.status).toBe(201);
      createdIds.push((await res.json()).data.id);
    }

    const collectedIds: string[] = [];
    let cursor: string | null = null;
    const limit = 2;

    do {
      const path =
        cursor === null
          ? `${discoverPath}?limit=${limit}`
          : `${discoverPath}?limit=${limit}&cursor=${encodeURIComponent(cursor)}`;
      const res = await get(path, mustafa);
      expect(res.status).toBe(200);
      const page = await data<DiscoverPage>(res);
      for (const item of page.items) {
        collectedIds.push(item.id as string);
      }
      cursor = page.nextCursor;
    } while (cursor !== null);

    for (const id of createdIds) {
      expect(collectedIds).toContain(id);
    }
    expect(new Set(createdIds).size).toBe(3);
  });

  it("migration sonrası mevcut seed etkinlikleri university görünürlüğünde", async () => {
    const rows = await db
      .select({ title: activities.title, visibility: activities.visibility })
      .from(activities)
      .where(eq(activities.title, "React ile Web Atölyesi"));
    expect(rows.length).toBe(1);
    expect(rows[0]!.visibility).toBe("university");
  });

  it("danışman inter_university seçemez, SKS seçebilir", async () => {
    const advisor = await login("ahmet.hoca@antalya.edu.tr");
    const draft = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: "Görünürlük Test Etkinliği",
      startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      publish: false,
    });
    expect(draft.status).toBe(201);
    const activityId = (await draft.json()).data.id;

    const advisorPatch = await reqAuth(
      "PATCH",
      `/api/clubs/${techClubId}/activities/${activityId}`,
      advisor,
      { visibility: "inter_university" }
    );
    expect(advisorPatch.status).toBe(403);

    const sksPatch = await reqAuth(
      "PATCH",
      `/api/admin/universities/${antalyaUni}/clubs/${techClubId}/activities/${activityId}`,
      antalyaSks,
      { visibility: "inter_university" }
    );
    expect(sksPatch.status).toBe(200);
    expect((await sksPatch.json()).data.visibility).toBe("inter_university");
  });
});
