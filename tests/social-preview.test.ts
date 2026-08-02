import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { data, get, login } from "./helpers";
import { socialPreviewRepository } from "../src/features/social-preview/social-preview.repository";

type SocialFields = {
  commentCount?: number;
  likeCount?: number;
  recentComments?: Array<{ authorName: string; body: string; createdAt: string }>;
};

describe("demo sosyal önizleme (feed.social.preview)", () => {
  let mustafa: string;
  let cem: string;
  let antalyaTechClubId: string;
  let egeTechClubId: string;

  beforeAll(async () => {
    [mustafa, cem] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("cem.arslan@std.egebilim.edu.tr"),
    ]);

    const antalyaClubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    antalyaTechClubId = antalyaClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;

    const egeClubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", cem));
    egeTechClubId = egeClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  it("bayrak açık (Antalya): galeri listesinde sosyal alanlar ve son yorumlar", async () => {
    const images = await data<SocialFields[]>(
      await get(`/api/clubs/${antalyaTechClubId}/gallery`, mustafa)
    );
    const first = images[0]!;
    expect(first.commentCount).toBeGreaterThan(0);
    expect(first.likeCount).toBeGreaterThan(0);
    expect(first.recentComments?.length).toBeGreaterThan(0);
    expect(first.recentComments![0].authorName).toBeTruthy();
    expect(first.recentComments![0].body).toBeTruthy();
  });

  it("bayrak kapalı (Ege): galeri yanıtında sosyal alanlar yok", async () => {
    const images = await data<SocialFields[]>(
      await get(`/api/clubs/${egeTechClubId}/gallery`, cem)
    );
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img).not.toHaveProperty("commentCount");
      expect(img).not.toHaveProperty("likeCount");
      expect(img).not.toHaveProperty("recentComments");
    }
  });

  it("bayrak açık: etkinlik keşif listesinde sosyal alanlar", async () => {
    const activities = await data<SocialFields[]>(
      await get("/api/activities?scope=upcoming", mustafa)
    );
    const react = activities.find((a) => (a as { title?: string }).title === "React ile Web Atölyesi") as
      | (SocialFields & { title: string })
      | undefined;
    expect(react).toBeDefined();
    expect(react!.commentCount).toBeGreaterThan(0);
    expect(react!.likeCount).toBeGreaterThan(0);
    expect(react!.recentComments?.length).toBeGreaterThan(0);
  });

  it("bayrak kapalı: etkinlik keşif listesinde sosyal alanlar yok", async () => {
    const activities = await data<SocialFields[]>(
      await get("/api/activities?scope=upcoming", cem)
    );
    expect(activities.length).toBeGreaterThan(0);
    for (const activity of activities) {
      expect(activity).not.toHaveProperty("commentCount");
      expect(activity).not.toHaveProperty("likeCount");
      expect(activity).not.toHaveProperty("recentComments");
    }
  });

  it("çapraz tenant galeri okuma → 404", async () => {
    expect((await get(`/api/clubs/${antalyaTechClubId}/gallery`, cem)).status).toBe(404);
  });

  it("galeri listesi: sosyal veri tek batch (N+1 yok)", async () => {
    const engagementSpy = spyOn(socialPreviewRepository, "loadGalleryEngagement");
    const commentsSpy = spyOn(socialPreviewRepository, "recentGalleryComments");

    await get(`/api/clubs/${antalyaTechClubId}/gallery`, mustafa);

    expect(engagementSpy.mock.calls.length).toBe(1);
    expect(commentsSpy.mock.calls.length).toBe(1);

    engagementSpy.mockRestore();
    commentsSpy.mockRestore();
  });
});
