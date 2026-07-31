import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, me, data } from "./helpers";

/**
 * dashboard/feed feature'ının uçtan uca davranışı: öğrenci feed'i (kulüplerimin
 * duyuru+etkinlikleri), öğrenci özeti, kulüp paneli (staff), admin paneli (tenant
 * + guard + tenant-scope). Seed'deki sabit hesaplara dayanır.
 */
describe("Dashboard / Feed", () => {
  let mustafa: string; // techClub başkanı (üye + staff)
  let sen: string; // techClub ÜYESİ (staff DEĞİL)
  let elif: string; // Antalya admin (user.view)
  let okan: string; // Ege admin
  let antalyaUni: string;
  let egeUni: string;
  let techClubId: string;

  beforeAll(async () => {
    [mustafa, sen, elif, okan] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("elif.demir@antalya.edu.tr"),
      login("okan.yildiz@egebilim.edu.tr"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;
    egeUni = (await me(okan)).universityId as string;
    const clubs = await data<{ id: string; slug: string }[]>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  // ── Öğrenci feed ──────────────────────────────────────────────────────────
  it("feed token yoksa → 401", async () => {
    expect((await get("/api/feed")).status).toBe(401);
  });

  it("feed: kulüplerimin duyuru+etkinliklerini karışık döner, her öğede tip+kulüp", async () => {
    const feed = await data<{ items: any[]; nextCursor: string | null }>(await get("/api/feed?limit=10", mustafa));
    expect(feed.items.length).toBeGreaterThan(0);
    for (const item of feed.items) {
      expect(["announcement", "activity"]).toContain(item.type);
      expect(item.club).toBeTruthy();
      expect(typeof item.at).toBe("string");
    }
    // En yeniden eskiye sıralı (at azalan)
    const times = feed.items.map((i) => new Date(i.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  // ── Öğrenci özeti ─────────────────────────────────────────────────────────
  it("öğrenci özeti: sayaç alanları + nextActivity yapısı", async () => {
    const s = await data<any>(await get("/api/users/me/dashboard", mustafa));
    expect(typeof s.clubCount).toBe("number");
    expect(s.clubCount).toBeGreaterThanOrEqual(1); // mustafa techClub başkanı
    expect(typeof s.upcomingAttendingCount).toBe("number");
    expect(s).toHaveProperty("pendingJoinRequests");
    expect(s).toHaveProperty("pendingApplications");
    expect(s).toHaveProperty("nextActivity");
  });

  // ── Kulüp paneli (staff) ──────────────────────────────────────────────────
  it("kulüp paneli: staff → 200 (sayaçlar); üye (staff değil) → 403", async () => {
    const staffRes = await get(`/api/clubs/${techClubId}/dashboard`, mustafa);
    expect(staffRes.status).toBe(200);
    const d = (await staffRes.json()).data;
    expect(typeof d.memberCount).toBe("number");
    expect(typeof d.pendingJoinRequests).toBe("number");
    expect(typeof d.upcomingActivityCount).toBe("number");
    expect(typeof d.announcementCount).toBe("number");

    // 'sen' techClub üyesi ama officer/president değil → staff değil → 403
    expect((await get(`/api/clubs/${techClubId}/dashboard`, sen)).status).toBe(403);
  });

  // ── Admin paneli (tenant + guard + tenant-scope) ───────────────────────────
  it("admin paneli: yetkili admin → 200; öğrenci (user.view yok) → 403; çapraz tenant → 403", async () => {
    const okRes = await get(`/api/admin/universities/${antalyaUni}/dashboard`, elif);
    expect(okRes.status).toBe(200);
    const d = (await okRes.json()).data;
    expect(d.clubsByStatus).toBeTruthy();
    expect(d.usersByStatus).toBeTruthy();
    expect(typeof d.pendingApplications).toBe("number");
    expect(typeof d.upcomingActivityCount).toBe("number");

    // öğrenci mustafa'da user.view yok → 403
    expect((await get(`/api/admin/universities/${antalyaUni}/dashboard`, mustafa)).status).toBe(403);
    // Antalya admini Ege'nin panelini göremez (tenant scope) → 403
    expect((await get(`/api/admin/universities/${egeUni}/dashboard`, elif)).status).toBe(403);
  });
});
