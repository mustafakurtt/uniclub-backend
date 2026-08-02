import { describe, it, expect, beforeAll, spyOn } from "bun:test";
import { db } from "../src/db";
import { auditLogs } from "../src/db/schema";
import { data, get, login, me, reqAuth, postJson } from "./helpers";

type SummaryResponse = {
  period: { from: string; to: string; academicTermId: string | null };
  counts: {
    applicationsSubmitted: number;
    generalMeetingsHeld: number;
    activitiesHeld: number;
  };
};

type DecisionItem = {
  id: string;
  action: string;
  actionLabel: string;
  targetType: string | null;
  targetId: string | null;
  actor: { id: string; displayName: string | null; anonymized: boolean } | null;
  note: string | null;
};

describe("denetim teftiş görünümü (T4.4)", () => {
  let elif: string;
  let mustafa: string;
  let denetci: string;
  let antalyaUni: string;
  let antalyaTermId: string;
  let techClubId: string;

  const summaryUrl = (query: string) =>
    `/api/admin/universities/${antalyaUni}/audit/summary?${query}`;
  const decisionsUrl = (query: string) =>
    `/api/admin/universities/${antalyaUni}/audit/decisions?${query}`;

  beforeAll(async () => {
    [elif, mustafa, denetci] = await Promise.all([
      login("elif.demir@antalya.edu.tr"),
      login("mustafa.kurt@std.antalya.edu.tr"),
      login("denetci@antalya.edu.tr"),
    ]);
    antalyaUni = (await me(elif)).universityId as string;

    const terms = await data<Array<{ id: string; name: string }>>(
      await get(`/api/universities/${antalyaUni}/academic-terms`, elif)
    );
    antalyaTermId = terms.find((t) => t.name.includes("2025-2026"))!.id;

    const clubs = await data<Array<{ id: string; slug: string }>>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  it("özet: akademik dönem filtresi ile sayımlar dolu", async () => {
    const summary = await data<SummaryResponse>(
      await get(summaryUrl(`academicTermId=${antalyaTermId}`), elif)
    );
    expect(summary.counts.applicationsSubmitted).toBeGreaterThan(0);
    expect(summary.counts.generalMeetingsHeld).toBeGreaterThanOrEqual(1);
    expect(summary.counts.activitiesHeld).toBeGreaterThan(0);
    expect(summary.period.academicTermId).toBe(antalyaTermId);
  });

  it("özet: aralık dışı dönemde sayımlar sıfır", async () => {
    const summary = await data<SummaryResponse>(
      await get(
        summaryUrl(
          `from=1990-01-01T00:00:00%2B03:00&to=1990-12-31T23:59:59%2B03:00`
        ),
        elif
      )
    );
    expect(summary.counts.applicationsSubmitted).toBe(0);
    expect(summary.counts.generalMeetingsHeld).toBe(0);
    expect(summary.counts.activitiesHeld).toBe(0);
  });

  it("özet: tek SELECT ile toplanır (N+1 yok)", async () => {
    const selectSpy = spyOn(db, "select");
    await get(summaryUrl(`academicTermId=${antalyaTermId}`), elif);
    expect(selectSpy.mock.calls.length).toBe(1);
    selectSpy.mockRestore();
  });

  it("karar görünümü: başvuru reti karar satırı olarak listelenir", async () => {
    const apps = await data<Array<{ id: string; proposedName: string }>>(
      await get(`/api/admin/universities/${antalyaUni}/club-applications?status=pending`, elif)
    );
    const app = apps.find((a) => a.proposedName.includes("Satranç"));
    expect(app).toBeDefined();

    const note = `Denetim ret gerekçesi ${Date.now()}`;
    expect(
      (
        await reqAuth(
          "PATCH",
          `/api/admin/universities/${antalyaUni}/club-applications/${app!.id}/reject`,
          elif,
          { note }
        )
      ).status
    ).toBe(200);

    const decisions = await data<{ items: DecisionItem[] }>(
      await get(
        decisionsUrl(
          `academicTermId=${antalyaTermId}&limit=50`
        ),
        elif
      )
    );

    const row = decisions.items.find(
      (d) => d.targetId === app!.id && d.actionLabel.includes("reddedildi")
    );
    expect(row).toBeDefined();
    expect(row!.note).toBe(note);
    expect(row!.action).toBe("application.view");
  });

  it("karar görünümü: rutin club.update (profil) karar listesinde değil", async () => {
    const marker = `denetim-non-decision-${Date.now()}`;
    expect(
      (
        await reqAuth(
          "PATCH",
          `/api/admin/universities/${antalyaUni}/clubs/${techClubId}`,
          elif,
          { description: marker }
        )
      ).status
    ).toBe(200);

    const decisions = await data<{ items: DecisionItem[] }>(
      await get(decisionsUrl(`academicTermId=${antalyaTermId}&limit=100`), elif)
    );
    expect(
      decisions.items.some(
        (d) => d.action === "club.update" && d.targetId === techClubId && !d.actionLabel.includes("arşiv")
      )
    ).toBe(false);
  });

  it("karar görünümü: keyset sayfalama satır atlamaz", async () => {
    const first = await data<{ items: DecisionItem[]; nextCursor: string | null }>(
      await get(decisionsUrl(`academicTermId=${antalyaTermId}&limit=1`), elif)
    );
    expect(first.items.length).toBe(1);
    expect(first.nextCursor).toBeTruthy();

    const second = await data<{ items: DecisionItem[] }>(
      await get(
        decisionsUrl(
          `academicTermId=${antalyaTermId}&limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`
        ),
        elif
      )
    );
    expect(second.items.length).toBe(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });

  it("yetki: audit.view olmayan öğrenci → 403", async () => {
    expect((await get(summaryUrl(`academicTermId=${antalyaTermId}`), mustafa)).status).toBe(403);
    expect((await get(decisionsUrl(`academicTermId=${antalyaTermId}`), mustafa)).status).toBe(403);
  });

  it("auditor rolü özeti okuyabilir", async () => {
    expect((await get(summaryUrl(`academicTermId=${antalyaTermId}`), denetci)).status).toBe(200);
  });

  it("çapraz tenant üniversite yolu → 403", async () => {
    const okan = await login("okan.yildiz@egebilim.edu.tr");
    expect((await get(summaryUrl(`academicTermId=${antalyaTermId}`), okan)).status).toBe(403);
  });

  it("anonimleştirilmiş aktörün adı yanıtta yok", async () => {
    const email = `audit-anon-${Date.now()}@std.antalya.edu.tr`;
    const registerRes = await postJson("/api/auth/register", {
      email,
      password: "Password123!",
      firstName: "Anon",
      lastName: "Test",
      studentNumber: String(Date.now()).slice(-9),
    });
    expect(registerRes.status).toBe(201);

    const anonUser = await db.query.users.findFirst({ where: { email } });
    expect(anonUser).toBeDefined();
    const anonUserId = anonUser!.id;

    await reqAuth(
      "POST",
      `/api/moderation/universities/${antalyaUni}/users/${anonUserId}/anonymize`,
      elif,
      { reason: "Denetim anonim testi", confirm: "ANONIMLESTIR" }
    );

    await db.insert(auditLogs).values({
      universityId: antalyaUni,
      actorId: anonUserId,
      action: "club.advisor.invitation.accepted",
      method: "PATCH",
      path: `/api/admin/universities/${antalyaUni}/clubs/${techClubId}/advisors/test/accept`,
      status: 200,
      targetType: "club",
      targetId: techClubId,
    });

    const decisions = await data<{ items: DecisionItem[] }>(
      await get(decisionsUrl(`academicTermId=${antalyaTermId}&limit=50`), elif)
    );
    const row = decisions.items.find((d) => d.actor?.id === anonUserId);
    expect(row).toBeDefined();
    expect(row!.actor!.anonymized).toBe(true);
    expect(row!.actor!.displayName).toBeNull();
  });
});
