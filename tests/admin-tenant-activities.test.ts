/**
 * Tenant geneli admin etkinlik listesi — GET /api/admin/universities/:universityId/activities
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, me, reqAuth, data } from "./helpers";

describe("admin tenant etkinlik listesi", () => {
  let sks: string;
  let sen: string;
  let mustafa: string;
  let ayse: string;
  let cem: string;
  let antalyaUni: string;
  let egeUni: string;
  let techClubId: string;
  let photoClubId: string;
  let egeClubId: string;

  const listUrl = (uni: string, query = "") =>
    `/api/admin/universities/${uni}/activities${query ? `?${query}` : ""}`;
  const soon = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
  const created = async (res: Response) => (await res.json()).data.id as string;

  beforeAll(async () => {
    [sks, sen, mustafa, ayse, cem] = await Promise.all([
      login("sks@antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("ayse.yilmaz@std.antalya.edu.tr"),
      login("cem.arslan@std.egebilim.edu.tr"),
    ]);
    antalyaUni = (await me(sks)).universityId as string;
    egeUni = (await me(cem)).universityId as string;

    const antalyaClubs = await data<{ id: string; slug: string }[]>(
      await get(`/api/admin/universities/${antalyaUni}/clubs`, sks)
    );
    techClubId = antalyaClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
    photoClubId = antalyaClubs.find((c) => c.slug === "fotografcilik")!.id;

    const egeClubs = await data<{ id: string; slug: string }[]>(
      await get(`/api/admin/universities/${egeUni}/clubs`, await login("sks@egebilim.edu.tr"))
    );
    egeClubId = egeClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  it("yetkisiz → 403", async () => {
    expect((await get(listUrl(antalyaUni), sen)).status).toBe(403);
  });

  it("çapraz tenant kulüp filtresi → 404", async () => {
    expect((await get(`${listUrl(antalyaUni)}?clubId=${egeClubId}`, sks)).status).toBe(404);
  });

  it("iki farklı kulübün etkinlikleri tek listede; clubName gömülü", async () => {
    const techTitle = "Tenant Liste Tech Etkinlik";
    const photoTitle = "Tenant Liste Foto Etkinlik";

    const techId = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title: techTitle,
        startsAt: soon(10),
      })
    );
    const photoId = await created(
      await reqAuth("POST", `/api/clubs/${photoClubId}/activities`, ayse, {
        title: photoTitle,
        startsAt: soon(11),
      })
    );

    const list = await data<{
      items: Array<{ id: string; title: string; clubId: string; clubName: string }>;
      nextCursor: string | null;
    }>(await get(`${listUrl(antalyaUni)}?scope=upcoming&limit=100`, sks));

    const techRow = list.items.find((a) => a.id === techId);
    const photoRow = list.items.find((a) => a.id === photoId);
    expect(techRow?.title).toBe(techTitle);
    expect(photoRow?.title).toBe(photoTitle);
    expect(techRow?.clubName).toBeTruthy();
    expect(photoRow?.clubName).toBeTruthy();
    expect(techRow?.clubId).toBe(techClubId);
    expect(photoRow?.clubId).toBe(photoClubId);
    expect(list.nextCursor === null || typeof list.nextCursor === "string").toBe(true);
  });

  it("taslak (upcoming) ve iptal edilmiş (cancelled) listede görünür", async () => {
    const draftTitle = "Tenant Liste Taslak";
    const cancelTitle = "Tenant Liste İptal";

    const draftId = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title: draftTitle,
        startsAt: soon(12),
        publish: false,
      })
    );
    const cancelId = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title: cancelTitle,
        startsAt: soon(13),
      })
    );
    expect(
      (await reqAuth("POST", `/api/admin/universities/${antalyaUni}/activities/${cancelId}/cancel`, sks)).status
    ).toBe(200);

    const upcoming = await data<{
      items: Array<{ id: string; title: string; status: string }>;
    }>(await get(`${listUrl(antalyaUni)}?scope=upcoming&limit=100`, sks));
    const draftRow = upcoming.items.find((a) => a.id === draftId);
    expect(draftRow?.title).toBe(draftTitle);
    expect(draftRow?.status).toBe("draft");

    const cancelled = await data<{
      items: Array<{ id: string; title: string; status: string }>;
    }>(await get(`${listUrl(antalyaUni)}?scope=cancelled&limit=100`, sks));
    const cancelRow = cancelled.items.find((a) => a.id === cancelId);
    expect(cancelRow?.title).toBe(cancelTitle);
    expect(cancelRow?.status).toBe("cancelled");
  });
});
