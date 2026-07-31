import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { data, get, login, me, reqAuth } from "./helpers";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";

describe("tenant_settings (C1)", () => {
  let elif: string;
  let okan: string;
  let mustafa: string;
  let superAdmin: string;
  let antalyaUni: string;
  let egeUni: string;
  let techClubId: string;

  const settingsPath = (uni: string) => `/api/universities/${uni}/settings`;
  const clubAnnouncements = (clubId: string) => `/api/clubs/${clubId}/announcements`;

  async function pinAnnouncement(clubId: string, token: string, suffix: string) {
    return await reqAuth("POST", clubAnnouncements(clubId), token, {
      title: `Pin ${suffix} ${Date.now()}`,
      content: "Sabitleme testi",
      pinned: true,
      publish: true,
    });
  }

  beforeAll(async () => {
    [elif, okan, mustafa, superAdmin] = await Promise.all([
      login("elif.demir@antalya.edu.tr"),
      login("okan.yildiz@egebilim.edu.tr"),
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("superadmin@platform.local"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;
    egeUni = (await me(okan)).universityId as string;

    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  afterAll(async () => {
    await reqAuth("PATCH", settingsPath(antalyaUni), elif, {
      settings: { [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: null },
    });
    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR]: null },
    });
  });

  it("varsayılan: dördüncü sabitleme reddedilir (kota 3)", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await pinAnnouncement(techClubId, mustafa, `default-${i}`)).status).toBe(201);
    }
    expect((await pinAnnouncement(techClubId, mustafa, "default-overflow")).status).toBe(400);
  });

  it("tenant kotayı 5 yapınca beşinci geçer, altıncı reddedilir", async () => {
    expect(
      (
        await reqAuth("PATCH", settingsPath(antalyaUni), elif, {
          settings: { [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: 5 },
        })
      ).status
    ).toBe(200);

    for (let i = 0; i < 2; i++) {
      expect((await pinAnnouncement(techClubId, mustafa, `raised-${i}`)).status).toBe(201);
    }
    expect((await pinAnnouncement(techClubId, mustafa, "raised-overflow")).status).toBe(400);
  });

  it("tenant izolasyonu: Antalya kotası Ege'yi etkilemez", async () => {
    const getEge = await data<Record<string, { value: number }>>(
      await get(settingsPath(egeUni), okan)
    );
    expect(getEge[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX].value).toBe(3);
  });

  it("sınır dışı değer 400", async () => {
    const res = await reqAuth("PATCH", settingsPath(antalyaUni), elif, {
      settings: { [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: 999 },
    });
    expect(res.status).toBe(400);
  });

  it("platform anahtarı üniversite yöneticisi değiştiremez (403); super_admin değiştirebilir", async () => {
    const denied = await reqAuth("PATCH", settingsPath(antalyaUni), elif, {
      settings: { [TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR]: 10 },
    });
    expect(denied.status).toBe(403);

    const allowed = await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR]: 10 },
    });
    expect(allowed.status).toBe(200);
    const body = await data<Record<string, { value: number }>>(allowed);
    expect(body[TenantSettingKey.UNIVERSITY_ANNOUNCEMENT_PUBLISH_PER_HOUR].value).toBe(10);
  });

  it("ayar değişimi anında etkili (cache SET — TTL beklemeden)", async () => {
    expect(
      (
        await reqAuth("PATCH", settingsPath(antalyaUni), elif, {
          settings: { [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: 2 },
        })
      ).status
    ).toBe(200);

    expect((await pinAnnouncement(techClubId, mustafa, "instant-overflow")).status).toBe(400);
  });

  it("varsayılana sıfırlama (satır silme) çalışır", async () => {
    expect(
      (
        await reqAuth("PATCH", settingsPath(antalyaUni), elif, {
          settings: { [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: null },
        })
      ).status
    ).toBe(200);

    const getRes = await data<Record<string, { value: number; default: number }>>(
      await get(settingsPath(antalyaUni), elif)
    );
    expect(getRes[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX].value).toBe(3);
    expect(getRes[TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX].default).toBe(3);
  });

  it("PATCH ayar değişikliği audit_logs'a düşer", async () => {
    const patchRes = await reqAuth("PATCH", settingsPath(antalyaUni), elif, {
      settings: { [TenantSettingKey.CLUB_PINNED_ANNOUNCEMENTS_MAX]: 4 },
    });
    expect(patchRes.status).toBe(200);

    const logs = await data<{ items: Array<{ action: string; path: string; status: number }> }>(
      await get(`/api/audit/universities/${antalyaUni}?limit=20`, elif)
    );
    const entry = logs.items.find((l) => l.action === "university.settings.manage");
    expect(entry).toBeDefined();
    expect(entry!.path).toBe(settingsPath(antalyaUni));
    expect(entry!.status).toBe(200);
  });
});
