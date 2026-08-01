/**
 * T8.5 özellik bayrağı — export pilot (Antalya açık, Ege kapalı).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { login, me, reqAuth, get } from "./helpers";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";

async function exportGet(universityId: string, token: string) {
  return get(`/api/universities/${universityId}/exports`, token);
}

async function exportPost(universityId: string, reportId: string, token: string, body: unknown = {}) {
  return reqAuth("POST", `/api/universities/${universityId}/exports/${reportId}`, token, body);
}

describe("özellik bayrağı — university.export.enabled", () => {
  let antalyaSks: string;
  let egeSks: string;
  let burak: string;
  let superAdmin: string;
  let antalyaUni: string;
  let egeUni: string;

  const settingsPath = (uni: string) => `/api/universities/${uni}/settings`;

  beforeAll(async () => {
    [antalyaSks, egeSks, burak, superAdmin] = await Promise.all([
      login("sks@antalya.edu.tr"),
      login("sks@egebilim.edu.tr"),
      login("burak.demirci@std.antalya.edu.tr"),
      login("superadmin@platform.local"),
    ]);
    antalyaUni = (await me(antalyaSks)).universityId as string;
    egeUni = (await me(egeSks)).universityId as string;
  });

  afterAll(async () => {
    await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_EXPORT_ENABLED]: true },
    });
  });

  it("bayrak açık tenant (Antalya) + yetkili SKS → 200", async () => {
    expect((await exportGet(antalyaUni, antalyaSks)).status).toBe(200);
    expect((await exportPost(antalyaUni, "clubs", antalyaSks, {})).status).toBe(200);
  });

  it("bayrak kapalı tenant (Ege) + yetkili SKS → 404", async () => {
    expect((await exportGet(egeUni, egeSks)).status).toBe(404);
    expect((await exportPost(egeUni, "clubs", egeSks, {})).status).toBe(404);
  });

  it("bayrak açık tenant + yetkisiz öğrenci → 403", async () => {
    expect((await exportGet(antalyaUni, burak)).status).toBe(403);
    expect((await exportPost(antalyaUni, "clubs", burak, {})).status).toBe(403);
  });

  it("PATCH ile bayrak kapat/aç → davranış anında değişir (cache)", async () => {
    const off = await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_EXPORT_ENABLED]: false },
    });
    expect(off.status).toBe(200);
    expect((await exportGet(antalyaUni, antalyaSks)).status).toBe(404);

    const on = await reqAuth("PATCH", settingsPath(antalyaUni), superAdmin, {
      settings: { [TenantSettingKey.UNIVERSITY_EXPORT_ENABLED]: true },
    });
    expect(on.status).toBe(200);
    expect((await exportGet(antalyaUni, antalyaSks)).status).toBe(200);
  });
});
