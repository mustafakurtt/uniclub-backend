import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, me, reqAuth, data } from "./helpers";

/**
 * Activities feature'ının uçtan uca davranışı (gerçek Postgres/Redis, app.request):
 *   - Keşif + cross-university (M:N host/co_host) görünürlüğü ve tenant izolasyonu
 *   - members-only görünürlük kapısı
 *   - Kapasite (going tüketir / interested tüketmez)
 *   - Host-staff yetkisi (oluştur/iptal)
 *   - RSVP ve "etkinliklerim"
 * Seed'deki sabit e-postalara/etkinliklere dayanır (bkz. src/db/seed.ts §5).
 */

const findBy = <T extends { title?: string; slug?: string }>(arr: T[], pred: (x: T) => boolean) => {
  const found = arr.find(pred);
  if (!found) throw new Error("test verisi bulunamadı");
  return found;
};

describe("Activities", () => {
  // Antalya
  let mustafa: string; // techClub başkanı (host staff)
  let sen: string; // techClub üyesi
  let ayse: string; // Fotoğrafçılık başkanı — techClub'da YETKİSİZ
  let emre: string; // Fotoğrafçılık ÜYESİ DEĞİL
  let burak: string; // Fotoğrafçılık üyesi
  // Ege
  let cem: string; // Ege öğrencisi (egeTechClub başkanı)

  let techClubId: string;
  let photoClubId: string;

  beforeAll(async () => {
    [mustafa, sen, ayse, emre, burak, cem] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("ayse.yilmaz@std.antalya.edu.tr"),
      login("emre.aksoy@std.antalya.edu.tr"),
      login("burak.demirci@std.antalya.edu.tr"),
      login("cem.arslan@std.egebilim.edu.tr"),
    ]);

    const clubs = await data<{ id: string; slug: string }[]>(await get("/api/clubs", mustafa));
    techClubId = findBy(clubs, (c) => c.slug === "yazilim-teknoloji").id;
    photoClubId = findBy(clubs, (c) => c.slug === "fotografcilik").id;
  });

  // ── Keşif + cross-university ───────────────────────────────────────────────
  it("token yoksa keşif → 401", async () => {
    expect((await get("/api/activities")).status).toBe(401);
  });

  it("Antalya keşfi: university görünürlüklü etkinlikler gelir, members-only GELMEZ", async () => {
    const list = await data<{ title: string; visibility: string }[]>(
      await get("/api/activities?scope=upcoming", mustafa)
    );
    const titles = list.map((a) => a.title);
    expect(titles).toContain("React ile Web Atölyesi");
    expect(titles).toContain("Üniversitelerarası Hackathon 2026");
    expect(titles).not.toContain("Üyelere Özel Karanlık Oda Atölyesi"); // members
    expect(list.every((a) => a.visibility === "university")).toBe(true);
  });

  it("⭐ cross-university: Ege öğrencisi co-host'u olduğu Hackathon'u görür, Antalya-only'yi GÖRMEZ", async () => {
    const list = await data<{ title: string }[]>(await get("/api/activities?scope=upcoming", cem));
    const titles = list.map((a) => a.title);
    expect(titles).toContain("Üniversitelerarası Hackathon 2026"); // Ege co_host → Ege akışında
    expect(titles).not.toContain("React ile Web Atölyesi"); // Antalya-only sızmaz
  });

  it("cross-university detay: host + co_host farklı üniversitelerden", async () => {
    const list = await data<{ id: string; title: string }[]>(await get("/api/activities?scope=upcoming", cem));
    const hackathonId = findBy(list, (a) => a.title.includes("Hackathon")).id;
    const detail = await data<any>(await get(`/api/activities/${hackathonId}`, cem));
    expect(detail.hostClub).toBeTruthy();
    expect(detail.coHostClubs.length).toBeGreaterThan(0);
    const unis = new Set([detail.hostClub.universityId, ...detail.coHostClubs.map((c: any) => c.universityId)]);
    expect(unis.size).toBe(2); // iki farklı üniversite tek etkinlikte
  });

  it("tenant izolasyonu: Ege'li kullanıcı Antalya-only etkinlik detayına erişemez → 404", async () => {
    const list = await data<{ id: string; title: string }[]>(await get("/api/activities?scope=upcoming", mustafa));
    const reactId = findBy(list, (a) => a.title.includes("React")).id;
    expect((await get(`/api/activities/${reactId}`, cem)).status).toBe(404);
  });

  // ── members-only görünürlük ────────────────────────────────────────────────
  it("members-only: üye kulüp listesinde görür + detaya erişir; üye-olmayan görmez + 403", async () => {
    const asBurak = await data<{ title: string; visibility: string }[]>(
      await get(`/api/clubs/${photoClubId}/activities`, burak)
    );
    const membersActivity = findBy(asBurak, (a) => a.visibility === "members");
    expect(membersActivity).toBeTruthy();

    const asEmre = await data<{ visibility: string }[]>(await get(`/api/clubs/${photoClubId}/activities`, emre));
    expect(asEmre.some((a) => a.visibility === "members")).toBe(false); // üye değil → görmez

    const id = (membersActivity as any).id;
    expect((await get(`/api/activities/${id}`, burak)).status).toBe(200); // üye
    expect((await get(`/api/activities/${id}`, emre)).status).toBe(403); // üye değil
  });

  // ── Yönetim (host staff) ───────────────────────────────────────────────────
  it("oluşturma: host staff → 201, staff olmayan → 403", async () => {
    const startsAt = new Date(Date.now() + 5 * 864e5).toISOString();
    const forbidden = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, ayse, {
      title: "Olmamalı",
      startsAt,
    });
    expect(forbidden.status).toBe(403); // ayşe techClub staff'ı değil

    const ok = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: "Test Etkinliği (staff)",
      startsAt,
    });
    expect(ok.status).toBe(201);
  });

  it("geçmiş başlangıç tarihi → 400", async () => {
    const past = new Date(Date.now() - 864e5).toISOString();
    const res = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: "Geçmiş",
      startsAt: past,
    });
    expect(res.status).toBe(400);
  });

  // ── Kapasite + RSVP ────────────────────────────────────────────────────────
  it("kapasite: going kontenjanı tüketir (dolunca 400), interested tüketmez", async () => {
    const startsAt = new Date(Date.now() + 6 * 864e5).toISOString();
    const created = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: "Kapasite Testi",
      startsAt,
      capacity: 1,
    });
    const activityId = (await created.json()).data.id;

    const first = await reqAuth("POST", `/api/activities/${activityId}/rsvp`, mustafa, { status: "going" });
    expect(first.status).toBe(200); // 1/1

    const full = await reqAuth("POST", `/api/activities/${activityId}/rsvp`, sen, { status: "going" });
    expect(full.status).toBe(400); // kontenjan dolu

    const interested = await reqAuth("POST", `/api/activities/${activityId}/rsvp`, sen, { status: "interested" });
    expect(interested.status).toBe(200); // kapasiteye tabi değil

    // "etkinliklerim" bu RSVP'yi içerir
    const mine = await data<{ activity: { id: string } }[]>(await get("/api/users/me/activities", sen));
    expect(mine.some((m) => m.activity.id === activityId)).toBe(true);

    // RSVP geri alma idempotent
    expect((await reqAuth("DELETE", `/api/activities/${activityId}/rsvp`, sen)).status).toBe(200);
  });

  // ── İptal ──────────────────────────────────────────────────────────────────
  it("iptal: host staff iptal eder → sonra detay 400; non-host iptal edemez → 403", async () => {
    const startsAt = new Date(Date.now() + 7 * 864e5).toISOString();
    const created = await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
      title: "İptal Testi",
      startsAt,
    });
    const activityId = (await created.json()).data.id;

    // Fotoğrafçılık başkanı ayşe, techClub etkinliğini iptal edemez (staff değil)
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${activityId}/cancel`, ayse)).status).toBe(403);

    const cancelled = await reqAuth("POST", `/api/clubs/${techClubId}/activities/${activityId}/cancel`, mustafa);
    expect(cancelled.status).toBe(200);

    // İptal edilmiş etkinlik detayı 400 döner
    expect((await get(`/api/activities/${activityId}`, mustafa)).status).toBe(400);
  });
});

// ── Ertelenen dilimler: draft/publish, check-in, co-host ──────────────────────
describe("Activities — draft/publish, check-in, co-host", () => {
  let mustafa: string; // techClub başkanı (host staff)
  let can: string; // Müzik kulübü başkanı + techClub officer (Müzik staff'ı)
  let sen: string; // techClub üyesi (staff değil)
  let cem: string; // Ege — egeTechClub başkanı
  let elif: string; // Antalya university_admin (activity.moderate)
  let okan: string; // Ege university_admin
  let antalyaUni: string;
  let egeUni: string;

  let techClubId: string;
  let musicClubId: string;
  let egeTechClubId: string;

  const soon = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
  const created = async (res: Response) => (await res.json()).data.id as string;

  beforeAll(async () => {
    [mustafa, can, sen, cem, elif, okan] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("can.ozturk@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("cem.arslan@std.egebilim.edu.tr"),
      login("elif.demir@antalya.edu.tr"),
      login("okan.yildiz@egebilim.edu.tr"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;
    egeUni = (await me(okan)).universityId as string;
    const antalyaClubs = await data<{ id: string; slug: string }[]>(await get("/api/clubs", mustafa));
    techClubId = antalyaClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
    musicClubId = antalyaClubs.find((c) => c.slug === "muzik")!.id;
    const egeClubs = await data<{ id: string; slug: string }[]>(await get("/api/clubs", cem));
    egeTechClubId = egeClubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  // ── Draft / publish ─────────────────────────────────────────────────────────
  it("taslak: publish=false → keşifte görünmez, STAFF kulüp listesinde görür, non-staff görmez", async () => {
    const id = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, {
        title: "Taslak Etkinlik",
        startsAt: soon(9),
        publish: false,
      })
    );

    const discovery = await data<{ title: string }[]>(await get("/api/activities?scope=upcoming", mustafa));
    expect(discovery.some((a) => a.title === "Taslak Etkinlik")).toBe(false); // taslak keşifte yok

    const asStaff = await data<{ title: string; status: string }[]>(await get(`/api/clubs/${techClubId}/activities`, mustafa));
    expect(asStaff.some((a) => a.title === "Taslak Etkinlik" && a.status === "draft")).toBe(true); // staff görür

    const asNonStaff = await data<{ title: string }[]>(await get(`/api/clubs/${techClubId}/activities`, sen));
    expect(asNonStaff.some((a) => a.title === "Taslak Etkinlik")).toBe(false); // üye/non-staff görmez

    // Yayınla → keşifte belirir; tekrar yayınlama 400
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/publish`, mustafa)).status).toBe(200);
    const after = await data<{ title: string }[]>(await get("/api/activities?scope=upcoming", mustafa));
    expect(after.some((a) => a.title === "Taslak Etkinlik")).toBe(true);
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/publish`, mustafa)).status).toBe(400);
  });

  // ── Check-in ────────────────────────────────────────────────────────────────
  it("yoklama: host staff RSVP'li katılımcıyı check-in eder; RSVP'siz → 404; geri alma çalışır", async () => {
    const id = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, { title: "Yoklama Testi", startsAt: soon(9) })
    );
    await reqAuth("POST", `/api/activities/${id}/rsvp`, mustafa, { status: "going" });

    // RSVP'si olmayan 'sen' → 404
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/attendees/${await meId(sen)}/check-in`, mustafa)).status).toBe(404);

    const mustafaId = await meId(mustafa);
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/attendees/${mustafaId}/check-in`, mustafa)).status).toBe(200);
    const attendees = await data<{ user: { id: string }; checkedInAt: string | null }[]>(
      await get(`/api/clubs/${techClubId}/activities/${id}/attendees`, mustafa)
    );
    expect(attendees.find((a) => a.user.id === mustafaId)?.checkedInAt).toBeTruthy();

    // Geri al → checkedInAt null
    expect((await reqAuth("DELETE", `/api/clubs/${techClubId}/activities/${id}/attendees/${mustafaId}/check-in`, mustafa)).status).toBe(200);
    const after = await data<{ user: { id: string }; checkedInAt: string | null }[]>(
      await get(`/api/clubs/${techClubId}/activities/${id}/attendees`, mustafa)
    );
    expect(after.find((a) => a.user.id === mustafaId)?.checkedInAt).toBeNull();
  });

  // ── Co-host (aynı üniversite) ─────────────────────────────────────────────────
  it("co-host (aynı üni): davet invited → kabul accepted; kendine/çift davet + non-host reddedilir", async () => {
    const id = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, { title: "Co-host Aynı Üni", startsAt: soon(9) })
    );

    // kendine davet → 400
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/co-hosts`, mustafa, { clubId: techClubId })).status).toBe(400);

    // Müzik'i davet et → 201 (invited)
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/co-hosts`, mustafa, { clubId: musicClubId })).status).toBe(201);
    let list = await data<{ clubId: string; status: string }[]>(await get(`/api/clubs/${techClubId}/activities/${id}/co-hosts`, mustafa));
    expect(list.find((x) => x.clubId === musicClubId)?.status).toBe("invited");

    // aynı kulübü tekrar davet → 400
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/co-hosts`, mustafa, { clubId: musicClubId })).status).toBe(400);

    // host olmayan bir kulüp (Müzik) davet etmeye çalışır → 403 (not host)
    expect((await reqAuth("POST", `/api/clubs/${musicClubId}/activities/${id}/co-hosts`, can, { clubId: techClubId })).status).toBe(403);

    // Müzik başkanı (can) daveti kabul eder → accepted
    expect((await reqAuth("POST", `/api/clubs/${musicClubId}/activities/${id}/co-host/accept`, can)).status).toBe(200);
    list = await data<{ clubId: string; status: string }[]>(await get(`/api/clubs/${techClubId}/activities/${id}/co-hosts`, mustafa));
    expect(list.find((x) => x.clubId === musicClubId)?.status).toBe("accepted");
  });

  // ── Co-host (cross-university) — accepted-only tenant kuralı ───────────────────
  it("⭐ co-host (cross-uni): davet edilmiş co-host Ege keşfinde SAYILMAZ, kabul edilince görünür", async () => {
    const id = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, { title: "Cross Turnuva Yeni", startsAt: soon(12) })
    );
    const inEge = async () =>
      (await data<{ title: string }[]>(await get("/api/activities?scope=upcoming", cem))).some((a) => a.title === "Cross Turnuva Yeni");
    // Ege kulübünün KENDİ etkinlik listesinde görünüyor mu? (invited iken görmemeli)
    const inEgeClubList = async () =>
      (await data<{ title: string }[]>(await get(`/api/clubs/${egeTechClubId}/activities`, cem))).some((a) => a.title === "Cross Turnuva Yeni");

    expect(await inEge()).toBe(false); // Antalya-only, Ege görmez

    // Ege kulübünü davet et → hâlâ Ege görmez (invited sayılmaz) — keşifte DE kulüp listesinde DE
    expect((await reqAuth("POST", `/api/clubs/${techClubId}/activities/${id}/co-hosts`, mustafa, { clubId: egeTechClubId })).status).toBe(201);
    expect(await inEge()).toBe(false);
    expect(await inEgeClubList()).toBe(false); // invited → kendi listesinde de yok

    // Ege başkanı kabul eder → artık Ege keşfinde VE kendi kulüp listesinde görünür
    expect((await reqAuth("POST", `/api/clubs/${egeTechClubId}/activities/${id}/co-host/accept`, cem)).status).toBe(200);
    expect(await inEge()).toBe(true);
    expect(await inEgeClubList()).toBe(true);
  });

  // ── Tenant moderasyonu (activity.moderate) ────────────────────────────────────
  it("moderasyon: admin (activity.moderate) tenant'ındaki etkinliği iptal eder; öğrenci→403; çapraz tenant→403", async () => {
    const id = await created(
      await reqAuth("POST", `/api/clubs/${techClubId}/activities`, mustafa, { title: "Moderasyon Hedefi", startsAt: soon(9) })
    );
    const cancelUrl = (uni: string) => `/api/admin/universities/${uni}/activities/${id}/cancel`;

    // öğrenci mustafa'da activity.moderate yok → 403
    expect((await reqAuth("POST", cancelUrl(antalyaUni), mustafa)).status).toBe(403);
    // Antalya admini Ege path'iyle → tenant scope 403
    expect((await reqAuth("POST", cancelUrl(egeUni), elif)).status).toBe(403);
    // Antalya admini kendi tenant'ında → 200, etkinlik iptal
    expect((await reqAuth("POST", cancelUrl(antalyaUni), elif)).status).toBe(200);
    expect((await get(`/api/activities/${id}`, mustafa)).status).toBe(400); // artık cancelled
  });
});

/** Token sahibinin userId'si (check-in testinde attendee id'si için). */
async function meId(token: string): Promise<string> {
  return (await me(token)).userId;
}
