import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app, data, get, login, me, reqAuth } from "./helpers";

describe("tenant profili (C2)", () => {
  let elif: string;
  let okan: string;
  let mustafa: string;
  let antalyaUni: string;
  let egeUni: string;

  beforeAll(async () => {
    [elif, okan, mustafa] = await Promise.all([
      login("elif.demir@antalya.edu.tr"),
      login("okan.yildiz@egebilim.edu.tr"),
      login("mustafa.kurt@std.antalya.edu.tr"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;
    egeUni = (await me(okan)).universityId as string;
  });

  afterAll(async () => {
    await reqAuth("PATCH", `/api/universities/${antalyaUni}`, elif, {
      timezone: "Europe/Istanbul",
      defaultLocale: "tr",
      logoUrl: null,
      primaryColor: null,
    });
    await reqAuth("PATCH", "/api/users/me", mustafa, { preferredLanguage: "tr" });
  });

  it("varsayılanlar: timezone Europe/Istanbul, defaultLocale tr", async () => {
    const uni = await data<{
      timezone: string;
      defaultLocale: string;
    }>(await get(`/api/universities/${antalyaUni}`));
    expect(uni.timezone).toBe("Europe/Istanbul");
    expect(uni.defaultLocale).toBe("tr");
  });

  it("geçersiz IANA saat dilimi 400", async () => {
    const res = await reqAuth("PATCH", `/api/universities/${antalyaUni}`, elif, {
      timezone: "Not/A_TimeZone",
    });
    expect(res.status).toBe(400);
  });

  it("university_admin profil alanlarını güncelleyebilir", async () => {
    const res = await reqAuth("PATCH", `/api/universities/${antalyaUni}`, elif, {
      timezone: "America/New_York",
      defaultLocale: "en",
      logoUrl: "https://example.com/logo.png",
      primaryColor: "#2563eb",
    });
    expect(res.status).toBe(200);
    const body = await data<{
      timezone: string;
      defaultLocale: string;
      logoUrl: string | null;
      primaryColor: string | null;
    }>(res);
    expect(body.timezone).toBe("America/New_York");
    expect(body.defaultLocale).toBe("en");
    expect(body.logoUrl).toBe("https://example.com/logo.png");
    expect(body.primaryColor).toBe("#2563eb");
  });

  it("tenant izolasyonu: Antalya timezone Ege'yi etkilemez", async () => {
    const ege = await data<{ timezone: string; defaultLocale: string }>(
      await get(`/api/universities/${egeUni}`)
    );
    expect(ege.timezone).toBe("Europe/Istanbul");
    expect(ege.defaultLocale).toBe("tr");
  });

  it("locale önceliği: kullanıcı tercihi Accept-Language'ı ezer", async () => {
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
