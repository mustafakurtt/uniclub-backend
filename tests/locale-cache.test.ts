import { describe, it, expect, beforeAll, spyOn, afterAll } from "bun:test";
import { db } from "../src/db";
import { cache } from "../src/shared/cache/cache.client";
import {
  resolveUserPreferredLanguage,
  resolveTenantDefaultLocale,
} from "../src/shared/i18n/locale.cache";
import { app, login, me, reqAuth } from "./helpers";

describe("locale cache (i18n:locale)", () => {
  let mustafa: string;
  let userId: string;
  let universityId: string;

  beforeAll(async () => {
    mustafa = await login("mustafa.kurt@std.antalya.edu.tr");
    const info = await me(mustafa);
    userId = info.userId;
    universityId = info.universityId!;
    const ns = cache.namespace("i18n:locale");
    await ns.delete(`user:${userId}`);
    await ns.delete(`tenant:${universityId}`);
  });

  afterAll(async () => {
    await reqAuth("PATCH", "/api/users/me", mustafa, { preferredLanguage: "tr" });
  });

  it("kullanıcı tercihi: ikinci okuma DB'ye gitmez", async () => {
    const ns = cache.namespace("i18n:locale");
    await ns.delete(`user:${userId}`);

    const selectSpy = spyOn(db, "select");
    await resolveUserPreferredLanguage(userId);
    const afterFirst = selectSpy.mock.calls.length;
    await resolveUserPreferredLanguage(userId);
    expect(selectSpy.mock.calls.length).toBe(afterFirst);
    selectSpy.mockRestore();
  });

  it("tenant varsayılanı: ikinci okuma DB'ye gitmez", async () => {
    const ns = cache.namespace("i18n:locale");
    await ns.delete(`tenant:${universityId}`);

    const selectSpy = spyOn(db, "select");
    await resolveTenantDefaultLocale(universityId);
    const afterFirst = selectSpy.mock.calls.length;
    await resolveTenantDefaultLocale(universityId);
    expect(selectSpy.mock.calls.length).toBe(afterFirst);
    selectSpy.mockRestore();
  });

  it("dil değişince invalidate sonrası yeni dil geçerli", async () => {
    expect(
      (await reqAuth("PATCH", "/api/users/me", mustafa, { preferredLanguage: "en" })).status
    ).toBe(200);

    const res = await app.request(`/api/universities/${"00000000-0000-0000-0000-000000000001"}`, {
      headers: {
        authorization: `Bearer ${mustafa}`,
        "accept-language": "tr",
      },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("University not found.");
  });
});
