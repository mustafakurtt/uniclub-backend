import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { get, login, me, reqAuth, data } from "./helpers";
import { posterQrRepository } from "../src/features/poster-qr/poster-qr.repository";

const UNIVERSITY_SLUG = "antalya-bilim";
const TECH_CLUB_SLUG = "yazilim-teknoloji";

describe("Afiş QR (T10.1)", () => {
  let mustafa: string;
  let sen: string;
  let okan: string;
  let techClubId: string;
  let antalyaUniId: string;
  let publicActivityId: string;

  beforeAll(async () => {
    [mustafa, sen, okan] = await Promise.all([
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("250803001@std.antalya.edu.tr"),
      login("okan.yildiz@egebilim.edu.tr"),
    ]);
    antalyaUniId = (await me(mustafa)).universityId as string;

    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === TECH_CLUB_SLUG)!.id;

    const activities = await data<Array<{ id: string; title: string }>>(
      await get("/api/activities?scope=upcoming", mustafa)
    );
    publicActivityId = activities.find((a) => a.title === "React ile Web Atölyesi")!.id;
  });

  it("afiş kodu kulüp hedefine çözülür; hedef değişince aynı kod yeni hedefe gider", async () => {
    const created = await data<{ id: string; code: string }>(
      await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, mustafa, {
        sourceLabel: "A blok panosu",
        targetType: "club",
        targetClubId: techClubId,
      })
    );

    const first = await data<{ status: string; target?: { type: string; clubSlug: string } }>(
      await get(`/api/public/qr/${created.code}`)
    );
    expect(first.status).toBe("active");
    expect(first.target?.type).toBe("club");
    expect(first.target?.clubSlug).toBe(TECH_CLUB_SLUG);

    await reqAuth("PATCH", `/api/clubs/${techClubId}/poster-qr/${created.id}`, mustafa, {
      targetType: "activity",
      targetActivityId: publicActivityId,
    });

    const second = await data<{ status: string; target?: { type: string; activityId: string } }>(
      await get(`/api/public/qr/${created.code}`)
    );
    expect(second.status).toBe("active");
    expect(second.target?.type).toBe("activity");
    expect(second.target?.activityId).toBe(publicActivityId);
  });

  it("süresi dolmuş kod 404 değil — status expired", async () => {
    const created = await data<{ code: string }>(
      await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, mustafa, {
        sourceLabel: "eski kampanya",
        targetType: "club",
        targetClubId: techClubId,
        validUntil: new Date(Date.now() - 60_000),
      })
    );

    const body = await data<{ status: string }>(await get(`/api/public/qr/${created.code}`));
    expect(body.status).toBe("expired");
  });

  it("iptal edilmiş kod erişilemez — status cancelled", async () => {
    const created = await data<{ id: string; code: string }>(
      await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, mustafa, {
        sourceLabel: "iptal test",
        targetType: "club",
        targetClubId: techClubId,
      })
    );

    expect((await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr/${created.id}/cancel`, mustafa)).status).toBe(
      200
    );

    const body = await data<{ status: string }>(await get(`/api/public/qr/${created.code}`));
    expect(body.status).toBe("cancelled");
  });

  it("farklı kaynak etiketli iki kod ayrı sayaç tutuyor", async () => {
    const a = await data<{ id: string; code: string }>(
      await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, mustafa, {
        sourceLabel: "kantin",
        targetType: "club",
        targetClubId: techClubId,
      })
    );
    const b = await data<{ id: string; code: string }>(
      await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, mustafa, {
        sourceLabel: "Instagram",
        targetType: "club",
        targetClubId: techClubId,
      })
    );

    expect((await get(`/api/public/qr/${a.code}`)).status).toBe(200);
    expect((await get(`/api/public/qr/${a.code}`)).status).toBe(200);
    expect((await get(`/api/public/qr/${b.code}`)).status).toBe(200);

    const list = await data<Array<{ id: string; scanCount: number }>>(
      await get(`/api/clubs/${techClubId}/poster-qr`, mustafa)
    );
    const aRow = list.find((r) => r.id === a.id);
    const bRow = list.find((r) => r.id === b.id);
    expect(aRow?.scanCount).toBe(2);
    expect(bRow?.scanCount).toBe(1);
  });

  it("tarama sayacı yazımı başarısız olsa bile çözümleme çalışıyor", async () => {
    const created = await data<{ code: string }>(
      await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, mustafa, {
        sourceLabel: "fail-open",
        targetType: "club",
        targetClubId: techClubId,
      })
    );

    const spy = spyOn(posterQrRepository, "recordScan").mockRejectedValue(new Error("simulated"));
    const res = await get(`/api/public/qr/${created.code}`);
    spy.mockRestore();
    expect(res.status).toBe(200);
    const body = await data<{ status: string }>(res);
    expect(body.status).toBe("active");
  });

  it("başka tenant yönetim uçlarına sızmıyor", async () => {
    const created = await data<{ id: string }>(
      await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, mustafa, {
        sourceLabel: "tenant test",
        targetType: "club",
        targetClubId: techClubId,
      })
    );

    expect(
      (await reqAuth("PATCH", `/api/universities/${antalyaUniId}/poster-qr/${created.id}`, okan, {
        sourceLabel: "sızmaz",
      })).status
    ).toBe(403);
  });

  it("kulüp staff olmayan kullanıcı oluşturamaz", async () => {
    expect(
      (
        await reqAuth("POST", `/api/clubs/${techClubId}/poster-qr`, sen, {
          sourceLabel: "yetkisiz",
          targetType: "club",
          targetClubId: techClubId,
        })
      ).status
    ).toBe(403);
  });
});
