/**
 * Kulüp başvuru kontrol listesi + itiraz (T4.1) — madde işaretleme, kilit, itiraz akışı, tenant izolasyonu.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { login, me, reqAuth, get } from "./helpers";
import { db } from "../src/db";
import { clubApplications } from "../src/db/schema";
import { tenantSettings } from "../src/db/schema/tenant-settings";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";
import { invalidateTenantSettingsCache } from "../src/features/tenant-settings/tenant-settings.cache";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

const post = (path: string, token: string, body?: unknown) =>
  reqAuth("POST", path, token, body);

describe("kulüp başvuru kontrol listesi ve itiraz", () => {
  let antalyaUni: string;
  let sksToken: string;
  let adminToken: string;

  beforeAll(async () => {
    sksToken = await login("sks@antalya.edu.tr");
    adminToken = await login("elif.demir@antalya.edu.tr");
    antalyaUni = (await me(sksToken)).universityId as string;
  });

  async function createPendingApplication(applicantEmail: string) {
    const applicantToken = await login(applicantEmail);
    const applicantId = (await me(applicantToken)).userId;

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
          description: "Test.",
        });
      }
      await reqAuth("DELETE", `/api/clubs/applications/${app.id}`, applicantToken);
    }

    const res = await post("/api/clubs/applications", applicantToken, {
      proposedName: `Kontrol ${Date.now()}`,
      description: "Kontrol listesi testi.",
    });
    expect(res.status).toBe(201);
    const applicationId = (await res.json()).data.id as string;
    return { applicationId, applicantToken, applicantId };
  }

  async function rejectApplication(applicationId: string, rejectorToken: string) {
    const res = await patch(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/reject`,
      rejectorToken,
      { note: "Evraklar eksik — kurum yönergesine uygun değil." }
    );
    expect(res.status).toBe(200);
  }

  it("kontrol listesi madde işaretleme ve tenant kataloğu", async () => {
    const { applicationId } = await createPendingApplication("burak.demirci@std.antalya.edu.tr");

    const listRes = await get(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/checklist`,
      sksToken
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.items.length).toBeGreaterThan(0);
    expect(listBody.data.requireChecklistForApproval).toBe(false);

    const itemKey = listBody.data.items[0].key as string;
    const markRes = await patch(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/checklist/${itemKey}`,
      sksToken,
      { checked: true, note: "Evrak tam." }
    );
    expect(markRes.status).toBe(200);
    const marked = (await markRes.json()).data.items.find((i: { key: string }) => i.key === itemKey);
    expect(marked?.checked).toBe(true);
    expect(marked?.note).toBe("Evrak tam.");
  });

  it("onay kilidi açık — zorunlu maddeler eksikse 400; kapalı — onay geçer", async () => {
    await db
      .insert(tenantSettings)
      .values({
        universityId: antalyaUni,
        key: TenantSettingKey.CLUB_APPLICATION_REQUIRE_CHECKLIST_FOR_APPROVAL,
        value: true,
        updatedBy: (await me(adminToken)).userId,
      })
      .onConflictDoUpdate({
        target: [tenantSettings.universityId, tenantSettings.key],
        set: { value: true, updatedAt: new Date() },
      });
    await invalidateTenantSettingsCache(antalyaUni);

    const { applicationId } = await createPendingApplication("selin.koc@std.antalya.edu.tr");

    const failApprove = await patch(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/approve`,
      sksToken,
      {}
    );
    expect(failApprove.status).toBe(400);

    const checklist = (await (
      await get(
        `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/checklist`,
        sksToken
      )
    ).json()).data;

    for (const item of checklist.items.filter((i: { required: boolean }) => i.required)) {
      await patch(
        `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/checklist/${item.key}`,
        sksToken,
        { checked: true }
      );
    }

    const okApprove = await patch(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/approve`,
      sksToken,
      {}
    );
    expect(okApprove.status).toBe(200);

    await db
      .delete(tenantSettings)
      .where(
        and(
          eq(tenantSettings.universityId, antalyaUni),
          eq(tenantSettings.key, TenantSettingKey.CLUB_APPLICATION_REQUIRE_CHECKLIST_FOR_APPROVAL)
        )
      );
    await invalidateTenantSettingsCache(antalyaUni);
  });

  it("ret gerekçesi öğrenciye görünür; bir kez itiraz; kabul → pending", async () => {
    const { applicationId, applicantToken } = await createPendingApplication(
      "emre.aksoy@std.antalya.edu.tr"
    );
    await rejectApplication(applicationId, adminToken);

    const myApp = await get(`/api/clubs/applications/${applicationId}`, applicantToken);
    const myBody = await myApp.json();
    expect(myBody.data.rejectionReason).toContain("Evraklar eksik");
    expect(myBody.data.canAppeal).toBe(true);

    const appealRes = await post(`/api/clubs/applications/${applicationId}/appeal`, applicantToken, {
      note: "Evrakları tamamladım, yeniden değerlendirme talep ediyorum.",
    });
    expect(appealRes.status).toBe(201);

    const afterAppeal = await get(`/api/clubs/applications/${applicationId}`, applicantToken);
    const afterBody = (await afterAppeal.json()).data;
    expect(afterBody.appeal?.reason).toBe("Evrakları tamamladım, yeniden değerlendirme talep ediyorum.");
    expect(afterBody.appeal?.status).toBe("pending");
    expect(afterBody.appeal?.submittedAt).toBeTruthy();

    const adminDetail = await get(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}`,
      adminToken
    );
    const adminBody = (await adminDetail.json()).data;
    expect(adminBody.appeal?.reason).toBe("Evrakları tamamladım, yeniden değerlendirme talep ediyorum.");

    const secondAppeal = await post(`/api/clubs/applications/${applicationId}/appeal`, applicantToken, {
      note: "İkinci itiraz denemesi olmamalı.",
    });
    expect(secondAppeal.status).toBe(400);

    const reviewRes = await patch(
      `/api/admin/universities/${antalyaUni}/club-applications/${applicationId}/appeal/review`,
      sksToken,
      {
        decision: "upheld",
        note: "İtiraz gerekçesi yerinde — yeniden değerlendirme.",
      }
    );
    expect(reviewRes.status).toBe(200);
    expect((await reviewRes.json()).data.application.status).toBe("pending");

    const reviewedDetail = await get(`/api/clubs/applications/${applicationId}`, applicantToken);
    const reviewedBody = (await reviewedDetail.json()).data;
    expect(reviewedBody.appeal?.status).toBe("upheld");
    expect(reviewedBody.appeal?.reviewNote).toContain("yeniden değerlendirme");
    expect(reviewedBody.appeal?.reviewedBy?.email).toBeTruthy();

    const row = await db.query.clubApplications.findFirst({ where: { id: applicationId } });
    expect(row?.status).toBe("pending");
  });

  it("itiraz süresi dolmuş → 400", async () => {
    const { applicationId, applicantToken } = await createPendingApplication(
      "ayse.yilmaz@std.antalya.edu.tr"
    );
    await rejectApplication(applicationId, adminToken);

    const past = new Date();
    past.setDate(past.getDate() - 30);
    await db
      .update(clubApplications)
      .set({ rejectedAt: past })
      .where(eq(clubApplications.id, applicationId));

    const appealRes = await post(`/api/clubs/applications/${applicationId}/appeal`, applicantToken, {
      note: "Süre doldu ama itiraz denemesi.",
    });
    expect(appealRes.status).toBe(400);
  });

  it("başkasının başvurusu → 404; çapraz tenant admin → 404", async () => {
    const egeAdvisor = await login("leyla.hoca@egebilim.edu.tr");
    const egeUni = (await me(egeAdvisor)).universityId as string;

    const { applicationId, applicantToken } = await createPendingApplication(
      "burak.demirci@std.antalya.edu.tr"
    );

    const crossStudent = await post(`/api/clubs/applications/${applicationId}/appeal`, egeAdvisor, {
      note: "Başkasının başvurusuna itiraz denemesi.",
    });
    expect(crossStudent.status).toBe(404);

    const crossAdmin = await get(
      `/api/admin/universities/${egeUni}/club-applications/${applicationId}/checklist`,
      egeAdvisor
    );
    expect(crossAdmin.status).toBe(404);

    await reqAuth("DELETE", `/api/clubs/applications/${applicationId}`, applicantToken);
  });

  it("yetkisiz öğrenci admin kontrol listesine → 403", async () => {
    const student = await login("burak.demirci@std.antalya.edu.tr");
    const res = await get(
      `/api/admin/universities/${antalyaUni}/club-applications/00000000-0000-4000-8000-000000000001/checklist`,
      student
    );
    expect(res.status).toBe(403);
  });
});
