import { describe, it, expect, beforeAll } from "bun:test";
import { data, get, login, me, reqAuth } from "./helpers";

describe("kulüp galerisi (/api/clubs/:clubId/gallery)", () => {
  let mustafa: string;
  let can: string;
  let sen: string;
  let emre: string;
  let elif: string;
  let antalyaUni: string;
  let techClubId: string;

  beforeAll(async () => {
    [mustafa, can, sen, emre, elif] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("can.ozturk@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("emre.aksoy@std.antalya.edu.tr"),
      login("elif.demir@antalya.edu.tr"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;

    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  it("liste: giriş yapmış herkes seed görsellerini görebilir", async () => {
    const images = await data<Array<{ id: string }>>(await get(`/api/clubs/${techClubId}/gallery`, emre));
    expect(images.length).toBeGreaterThan(0);
  });

  it("yükleme: staff ekler, düz üye ekleyemez", async () => {
    const denied = await reqAuth("POST", `/api/clubs/${techClubId}/gallery`, sen, {
      imageUrl: "https://picsum.photos/seed/gallery-deny/800/600",
      caption: "Üye yükleyemez",
    });
    expect(denied.status).toBe(403);

    const added = await reqAuth("POST", `/api/clubs/${techClubId}/gallery`, can, {
      imageUrl: `https://picsum.photos/seed/gallery-ok-${Date.now()}/800/600`,
      caption: "Officer yükledi",
    });
    expect(added.status).toBe(201);
    const imageId = (await added.json()).data.id as string;

    expect((await reqAuth("DELETE", `/api/clubs/${techClubId}/gallery/${imageId}`, can)).status).toBe(200);
  });

  it("silme: üye staff silme yapamaz", async () => {
    const added = await reqAuth("POST", `/api/clubs/${techClubId}/gallery`, mustafa, {
      imageUrl: `https://picsum.photos/seed/gallery-del-${Date.now()}/800/600`,
    });
    const imageId = (await added.json()).data.id as string;

    expect((await reqAuth("DELETE", `/api/clubs/${techClubId}/gallery/${imageId}`, sen)).status).toBe(403);
    // temizlik
    expect((await reqAuth("DELETE", `/api/clubs/${techClubId}/gallery/${imageId}`, mustafa)).status).toBe(200);
  });

  it("tenant izolasyonu: Ege öğrencisi Antalya kulüp galerisine yazamaz", async () => {
    const cem = await login("cem.arslan@std.egebilim.edu.tr");
    expect(
      (
        await reqAuth("POST", `/api/clubs/${techClubId}/gallery`, cem, {
          imageUrl: "https://picsum.photos/seed/cross-tenant/800/600",
        })
      ).status
    ).toBe(403);
  });

  it("moderasyon: gallery.moderate ile admin yolu görseli kaldırır", async () => {
    const added = await reqAuth("POST", `/api/clubs/${techClubId}/gallery`, mustafa, {
      imageUrl: `https://picsum.photos/seed/moderate-${Date.now()}/800/600`,
      caption: "Moderasyon testi",
    });
    const imageId = (await added.json()).data.id as string;

    const modRes = await reqAuth(
      "DELETE",
      `/api/admin/universities/${antalyaUni}/clubs/${techClubId}/gallery/${imageId}`,
      elif
    );
    expect(modRes.status).toBe(200);

    const after = await data<Array<{ id: string }>>(await get(`/api/clubs/${techClubId}/gallery`, mustafa));
    expect(after.some((i) => i.id === imageId)).toBe(false);
  });
});
