/**
 * M2.5 — admin tekil varlık detay uçları ve kulüp sekme listeleri.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, me, data } from "./helpers";

describe("admin entity detail (M2.5)", () => {
  let elif: string;
  let sen: string;
  let cem: string;
  let antalyaUni: string;
  let egeUni: string;
  let techClubId: string;
  let egeClubId: string;
  let pendingApplicationId: string;
  let egePendingApplicationId: string;

  const clubUrl = (uni: string, clubId: string, suffix = "") =>
    `/api/admin/universities/${uni}/clubs/${clubId}${suffix}`;

  beforeAll(async () => {
    [elif, sen, cem] = await Promise.all([
      login("elif.demir@antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("cem.arslan@std.egebilim.edu.tr"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;
    egeUni = (await me(cem)).universityId as string;

    const antalyaClubs = await data<{ id: string; slug: string }[]>(
      await get(`/api/admin/universities/${antalyaUni}/clubs`, elif)
    );
    techClubId = antalyaClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;

    const egeClubs = await data<{ id: string; slug: string }[]>(
      await get(`/api/admin/universities/${egeUni}/clubs`, await login("okan.yildiz@egebilim.edu.tr"))
    );
    egeClubId = egeClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;

    const applications = await data<Array<{ id: string; proposedName: string }>>(
      await get(`/api/admin/universities/${antalyaUni}/club-applications?status=pending`, elif)
    );
    pendingApplicationId =
      applications.find((a) => a.proposedName === "Satranç Kulübü")?.id ??
      applications[0]?.id;

    const egeApps = await data<Array<{ id: string }>>(
      await get(`/api/admin/universities/${egeUni}/club-applications?status=pending`, await login("sks@egebilim.edu.tr"))
    );
    egePendingApplicationId = egeApps[0]?.id;
  });

  describe("GET club-applications/:applicationId", () => {
    const url = (uni: string, id: string) =>
      `/api/admin/universities/${uni}/club-applications/${id}`;

    it("yetkisiz → 403", async () => {
      expect((await get(url(antalyaUni, pendingApplicationId), sen)).status).toBe(403);
    });

    it("başka tenant başvuru kimliği → 404", async () => {
      expect((await get(url(antalyaUni, egePendingApplicationId), elif)).status).toBe(404);
    });

    it("var olmayan kimlik → 404", async () => {
      expect(
        (await get(url(antalyaUni, "00000000-0000-4000-8000-000000000099"), elif)).status
      ).toBe(404);
    });

    it("mutlu yol → applicant, approvals, revisionRequestCount", async () => {
      const app = await data<{
        id: string;
        applicant: { email: string } | null;
        approvals: Array<{ step: number; approverRole: string; status: string }>;
        revisionRequestCount: number;
      }>(await get(url(antalyaUni, pendingApplicationId), elif));
      expect(app.id).toBe(pendingApplicationId);
      expect(app.applicant?.email).toBeTruthy();
      expect(app.approvals.length).toBeGreaterThan(0);
      expect(typeof app.revisionRequestCount).toBe("number");
    });
  });

  describe("GET clubs/:clubId", () => {
    it("yetkisiz → 403", async () => {
      expect((await get(clubUrl(antalyaUni, techClubId), sen)).status).toBe(403);
    });

    it("başka tenant kulüp kimliği → 404", async () => {
      expect((await get(clubUrl(antalyaUni, egeClubId), elif)).status).toBe(404);
    });

    it("var olmayan kimlik → 404", async () => {
      expect(
        (await get(clubUrl(antalyaUni, "00000000-0000-4000-8000-000000000099"), elif)).status
      ).toBe(404);
    });

    it("mutlu yol → counts alanları", async () => {
      const club = await data<{
        id: string;
        counts: {
          members: number;
          pendingJoinRequests: number;
          upcomingActivities: number;
          advisors: number;
        };
      }>(await get(clubUrl(antalyaUni, techClubId), elif));
      expect(club.id).toBe(techClubId);
      expect(club.counts.members).toBeGreaterThanOrEqual(3);
      expect(club.counts.pendingJoinRequests).toBeGreaterThanOrEqual(1);
      expect(club.counts.upcomingActivities).toBeGreaterThanOrEqual(1);
      expect(club.counts.advisors).toBeGreaterThanOrEqual(1);
    });
  });

  describe("kulüp sekme listeleri", () => {
    it("announcements: yetkisiz 403, çapraz tenant 404, mutlu yol items+nextCursor", async () => {
      const path = clubUrl(antalyaUni, techClubId, "/announcements");
      expect((await get(path, sen)).status).toBe(403);
      expect((await get(clubUrl(antalyaUni, egeClubId, "/announcements"), elif)).status).toBe(404);
      const list = await data<{ items: unknown[]; nextCursor: string | null }>(
        await get(`${path}?limit=10`, elif)
      );
      expect(Array.isArray(list.items)).toBe(true);
      expect(list.nextCursor === null || typeof list.nextCursor === "string").toBe(true);
    });

    it("gallery: yetkisiz 403, çapraz tenant 404, mutlu yol", async () => {
      const path = clubUrl(antalyaUni, techClubId, "/gallery");
      expect((await get(path, sen)).status).toBe(403);
      expect((await get(clubUrl(antalyaUni, egeClubId, "/gallery"), elif)).status).toBe(404);
      const list = await data<{ items: unknown[]; nextCursor: string | null }>(
        await get(`${path}?limit=10`, elif)
      );
      expect(Array.isArray(list.items)).toBe(true);
    });

    it("activities: yetkisiz 403, çapraz tenant 404, mutlu yol", async () => {
      const path = clubUrl(antalyaUni, techClubId, "/activities");
      expect((await get(path, sen)).status).toBe(403);
      expect((await get(clubUrl(antalyaUni, egeClubId, "/activities"), elif)).status).toBe(404);
      const list = await data<{ items: unknown[]; nextCursor: string | null }>(
        await get(`${path}?limit=10`, elif)
      );
      expect(Array.isArray(list.items)).toBe(true);
      expect(list.items.length).toBeGreaterThan(0);
    });
  });
});
