/**
 * Öğrenci başvuru süreç geçmişi (T1.6 ADIM 0).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { login, me, reqAuth, data, get } from "./helpers";
import { db } from "../src/db";
import { clubApplicationEvents } from "../src/db/schema";
import {
  restoreAntalyaSeedApprovalChain,
  restoreAntalyaSeedFormationThreshold,
  setTenantFormationThreshold,
  useClubApproverChainForTests,
} from "./tenant-test-helpers";

const post = (path: string, token: string, body?: unknown) => reqAuth("POST", path, token, body);
const patch = (path: string, token: string, body?: unknown) => reqAuth("PATCH", path, token, body);

describe("öğrenci başvuru süreç geçmişi", () => {
  let antalyaUni: string;
  let admin: string;
  let applicantToken: string;
  let otherStudentToken: string;
  let applicationId: string;

  const historyUrl = (id: string) => `/api/clubs/applications/${id}/history`;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr");
    antalyaUni = (await me(admin)).universityId as string;
    await setTenantFormationThreshold(antalyaUni, 0, (await me(admin)).userId as string);
    await useClubApproverChainForTests(antalyaUni, (await me(admin)).userId as string);
    applicantToken = await login("demo.yk1@std.antalya.edu.tr");
    otherStudentToken = await login("emre.aksoy@std.antalya.edu.tr");

    const applicantId = (await me(applicantToken)).userId as string;
    const active = await db.query.clubApplications.findMany({
      where: {
        applicantId,
        status: { in: ["pending", "revision_requested"] },
      },
    });
    for (const app of active) {
      if (app.status === "revision_requested") {
        await patch(`/api/clubs/applications/${app.id}/resubmit`, applicantToken, {
          proposedName: `Temizlik ${Date.now()}`,
          description: "Test temizliği.",
        });
      }
      await reqAuth("DELETE", `/api/clubs/applications/${app.id}`, applicantToken);
    }

    const createRes = await post("/api/clubs/applications", applicantToken, {
      proposedName: `Süreç Geçmişi ${Date.now()}`,
      description: "Öğrenci history testi.",
    });
    expect(createRes.status).toBe(201);
    applicationId = (await createRes.json()).data.id as string;

    const revisionRes = await patch(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/request-revision`,
      admin,
      { note: "Eksik bilgi — lütfen açıklamayı genişletin." }
    );
    expect(revisionRes.status).toBe(200);

    await db.insert(clubApplicationEvents).values({
      applicationId,
      step: 0,
      eventType: "checklist_updated",
      actorId: (await me(admin)).userId,
      note: "internal:advisor_nominated:true",
    });
  });

  afterAll(async () => {
    const adminToken = await login("elif.demir@antalya.edu.tr");
    const actorId = (await me(adminToken)).userId as string;
    await restoreAntalyaSeedFormationThreshold(antalyaUni, actorId);
    await restoreAntalyaSeedApprovalChain(antalyaUni, actorId);
  });

  it("kendi başvurusu → 200 ve süreç olayları", async () => {
    const res = await get(historyUrl(applicationId), applicantToken);
    expect(res.status).toBe(200);
    const body = await data<{
      applicationId: string;
      events: Array<{ eventType: string; note?: string; actor?: unknown }>;
    }>(res);
    expect(body.applicationId).toBe(applicationId);
    expect(body.events.some((e) => e.eventType === "revision_requested")).toBe(true);
    expect(body.events.every((e) => e.eventType !== "checklist_updated")).toBe(true);
    expect(body.events.every((e) => !("actor" in e))).toBe(true);
    expect(body.events.every((e) => !("revisionRequestCount" in e))).toBe(true);
    const revision = body.events.find((e) => e.eventType === "revision_requested");
    expect(revision?.note).toContain("Eksik bilgi");
  });

  it("başkasının başvurusu → 404", async () => {
    expect((await get(historyUrl(applicationId), otherStudentToken)).status).toBe(404);
  });

  it("çapraz tenant başvuru → 404", async () => {
    const egeStudent = await login("cem.arslan@std.egebilim.edu.tr");
    expect((await get(historyUrl(applicationId), egeStudent)).status).toBe(404);
  });
});
