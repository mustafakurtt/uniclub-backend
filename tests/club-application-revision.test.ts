/**
 * Kulüp başvuru revizyon akışı (T4.1) — revizyon talebi, yeniden gönderim, geçmiş, bildirim, tenant izolasyonu.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { login, me, reqAuth, data, get } from "./helpers";
import { db } from "../src/db";
import {
  clubApplicationApprovals,
  notifications,
} from "../src/db/schema";
import { NotificationType } from "../src/features/notifications/notifications.types";
import {
  restoreAntalyaSeedApprovalChain,
  restoreAntalyaSeedFormationThreshold,
  setTenantFormationThreshold,
  useClubApproverChainForTests,
} from "./tenant-test-helpers";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

type NotifRow = typeof notifications.$inferSelect;

function countNotifsByType(notifs: NotifRow[], type: string) {
  return notifs.filter((n) => n.type === type).length;
}

async function notifsForUser(userId: string) {
  return db.select().from(notifications).where(eq(notifications.userId, userId));
}

describe("kulüp başvuru revizyon akışı", () => {
  describe("iki kademe (Ege) — zincir kaldığı yerden devam", () => {
    let egeUni: string;
    let advisor: string;
    let sks: string;

    const revisionNote = "Evrak eksik — tüzük maddesi uygun değil, lütfen düzeltin.";
    const revisionNote2 = "İsim çakışması var — kulüp adını değiştirin lütfen.";

    beforeAll(async () => {
      advisor = await login("leyla.hoca@egebilim.edu.tr");
      sks = await login("sks@egebilim.edu.tr");
      egeUni = (await me(advisor)).universityId as string;
    });

    /** Aktif başvuru varsa temizle — aynı öğrenciyle yeni başvuru açılabilsin. */
    async function clearActiveApplications(applicantToken: string, applicantId: string) {
      const activeApps = await db.query.clubApplications.findMany({
        where: {
          applicantId,
          status: { in: ["pending", "revision_requested"] },
        },
      });

      for (const app of activeApps) {
        if (app.status === "revision_requested") {
          await patch(`/api/clubs/applications/${app.id}/resubmit`, applicantToken, {
            proposedName: `Temizlik ${Date.now()}`,
            description: "Test temizliği.",
          });
        }
        await reqAuth("DELETE", `/api/clubs/applications/${app.id}`, applicantToken);
      }
    }

    /** Kademe 1 onaylı, kademe 2 bekleyen iki kademeli başvuru. */
    async function createTwoStepAppAtStage2Pending(applicantEmail: string) {
      const applicantToken = await login(applicantEmail);
      const applicantId = (await me(applicantToken)).userId;

      await clearActiveApplications(applicantToken, applicantId);

      const createRes = await reqAuth("POST", "/api/clubs/applications", applicantToken, {
        proposedName: `Revizyon ${Date.now()}`,
        description: "İki kademe revizyon testi.",
      });
      expect(createRes.status).toBe(201);
      const applicationId = (await createRes.json()).data.id as string;

      expect(
        (await patch(
          `/api/admin/universities/${egeUni}/club-applications/${applicationId}/approve`,
          advisor
        )).status
      ).toBe(200);

      return { applicationId, applicantToken, applicantId };
    }

    const revisionUrl = (applicationId: string) =>
      `/api/admin/universities/${egeUni}/club-applications/${applicationId}/request-revision`;
    const resubmitUrl = (applicationId: string) =>
      `/api/clubs/applications/${applicationId}/resubmit`;
    const historyUrl = (applicationId: string) =>
      `/api/admin/universities/${egeUni}/club-applications/${applicationId}/history`;

    it("revizyon talebi → revision_requested; gerekçe zorunlu", async () => {
      const { applicationId, applicantId } = await createTwoStepAppAtStage2Pending(
        "gizem.polat@std.egebilim.edu.tr"
      );

      expect((await patch(revisionUrl(applicationId), sks, { note: "kısa" })).status).toBe(400);

      const beforeNotifs = await notifsForUser(applicantId);
      const beforeRevision = countNotifsByType(
        beforeNotifs,
        NotificationType.CLUB_APPLICATION_REVISION_REQUESTED
      );

      const res = await patch(revisionUrl(applicationId), sks, { note: revisionNote });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.application.status).toBe("revision_requested");

      const appRow = await db.query.clubApplications.findFirst({ where: { id: applicationId } });
      expect(appRow?.status).toBe("revision_requested");

      const approvals = await db
        .select()
        .from(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, applicationId));
      expect(approvals.find((a) => a.step === 1)?.status).toBe("approved");
      expect(approvals.find((a) => a.step === 2)?.status).toBe("revision_requested");

      const afterNotifs = await notifsForUser(applicantId);
      expect(
        countNotifsByType(afterNotifs, NotificationType.CLUB_APPLICATION_REVISION_REQUESTED)
      ).toBe(beforeRevision + 1);

      const pendingList = await data<Array<{ id: string }>>(
        await get(`/api/admin/universities/${egeUni}/club-applications?status=pending`, sks)
      );
      expect(pendingList.some((a) => a.id === applicationId)).toBe(false);

      const revisionList = await data<Array<{ id: string }>>(
        await get(`/api/admin/universities/${egeUni}/club-applications?status=revision_requested`, sks)
      );
      expect(revisionList.some((a) => a.id === applicationId)).toBe(true);
    });

    it("öğrenci düzenleyip yeniden gönderir — aynı kayıt, kademe 1 onayı korunur", async () => {
      const { applicationId, applicantToken, applicantId } = await createTwoStepAppAtStage2Pending(
        "gizem.polat@std.egebilim.edu.tr"
      );

      expect(
        (await patch(revisionUrl(applicationId), sks, { note: revisionNote })).status
      ).toBe(200);

      const newName = `Revizyon Düzeltildi ${Date.now()}`;
      const res = await patch(resubmitUrl(applicationId), applicantToken, {
        proposedName: newName,
        description: "Düzeltilmiş açıklama.",
      });
      expect(res.status).toBe(200);

      const appRow = await db.query.clubApplications.findFirst({ where: { id: applicationId } });
      expect(appRow?.id).toBe(applicationId);
      expect(appRow?.status).toBe("pending");
      expect(appRow?.proposedName).toBe(newName);

      const approvals = await db
        .select()
        .from(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, applicationId));
      expect(approvals.find((a) => a.step === 1)?.status).toBe("approved");
      expect(approvals.find((a) => a.step === 2)?.status).toBe("pending");

      await clearActiveApplications(applicantToken, applicantId);
    });

    it("öğrenci detayında revisionRequest görünür (revizyon beklerken)", async () => {
      const { applicationId, applicantToken, applicantId } = await createTwoStepAppAtStage2Pending(
        "gizem.polat@std.egebilim.edu.tr"
      );

      await patch(revisionUrl(applicationId), sks, { note: revisionNote2 });

      const detail = await data<{
        status: string;
        revisionRequest: { note: string; step: number } | null;
      }>(await get(`/api/clubs/applications/${applicationId}`, applicantToken));

      expect(detail.status).toBe("revision_requested");
      expect(detail.revisionRequest?.note).toBe(revisionNote2);
      expect(detail.revisionRequest?.step).toBe(2);

      await clearActiveApplications(applicantToken, applicantId);
    });

    it("aynı kademede ikinci revizyon turu — geçmişte her iki tur", async () => {
      const { applicationId, applicantToken, applicantId } = await createTwoStepAppAtStage2Pending(
        "gizem.polat@std.egebilim.edu.tr"
      );

      await patch(revisionUrl(applicationId), sks, { note: revisionNote });
      await patch(resubmitUrl(applicationId), applicantToken, {
        proposedName: `Revizyon Tur 1 ${Date.now()}`,
        description: "İlk tur düzeltme.",
      });
      await patch(revisionUrl(applicationId), sks, { note: revisionNote2 });
      await patch(resubmitUrl(applicationId), applicantToken, {
        proposedName: `Revizyon Tur 2 ${Date.now()}`,
        description: "İkinci tur düzeltme.",
      });

      const history = await data<{
        revisionRequestCount: number;
        events: Array<{ eventType: string; step: number; note: string | null }>;
      }>(await get(historyUrl(applicationId), sks));

      const revisionEvents = history.events.filter((e) => e.eventType === "revision_requested");
      expect(revisionEvents.length).toBe(2);
      expect(history.revisionRequestCount).toBe(2);
      expect(revisionEvents.every((e) => e.step === 2)).toBe(true);
      expect(revisionEvents.map((e) => e.note)).toContain(revisionNote);
      expect(revisionEvents.map((e) => e.note)).toContain(revisionNote2);

      const resubmitEvents = history.events.filter((e) => e.eventType === "resubmitted");
      expect(resubmitEvents.length).toBe(2);

      await clearActiveApplications(applicantToken, applicantId);
    });

    it("revizyon beklemeyen başvuru yeniden gönderilemez", async () => {
      const nazliToken = await login("nazli.gunes@std.egebilim.edu.tr");
      const nazliId = (await me(nazliToken)).userId;

      const pendingApp = await db.query.clubApplications.findFirst({
        where: { applicantId: nazliId, status: "pending" },
      });
      expect(pendingApp).toBeTruthy();

      expect(
        (await patch(`/api/clubs/applications/${pendingApp!.id}/resubmit`, nazliToken, {
          proposedName: "Yeni Ad Deneme Uzun",
        })).status
      ).toBe(400);
    });

    it("başkasının başvurusu düzenlenemez", async () => {
      const { applicationId, applicantToken, applicantId } = await createTwoStepAppAtStage2Pending(
        "gizem.polat@std.egebilim.edu.tr"
      );

      await patch(revisionUrl(applicationId), sks, { note: revisionNote });

      const cem = await login("cem.arslan@std.egebilim.edu.tr");
      expect(
        (await patch(resubmitUrl(applicationId), cem, {
          proposedName: "Başkasının başvurusu",
        })).status
      ).toBe(400);

      await clearActiveApplications(applicantToken, applicantId);
    });

    it("nihai onayda decided bildirimi; ara onayda yok", async () => {
      const { applicationId, applicantId } = await createTwoStepAppAtStage2Pending(
        "tolga.erden@std.egebilim.edu.tr"
      );

      const beforeNotifs = await notifsForUser(applicantId);
      const beforeDecided = countNotifsByType(
        beforeNotifs,
        NotificationType.CLUB_APPLICATION_DECIDED
      );
      const beforeTotal = beforeNotifs.length;

      expect(
        (await patch(
          `/api/admin/universities/${egeUni}/club-applications/${applicationId}/approve`,
          sks
        )).status
      ).toBe(200);

      const afterNotifs = await notifsForUser(applicantId);
      expect(
        countNotifsByType(afterNotifs, NotificationType.CLUB_APPLICATION_DECIDED)
      ).toBe(beforeDecided + 1);
      expect(afterNotifs.length).toBe(beforeTotal + 1);
    });
  });

  describe("tenant izolasyonu", () => {
    async function clearActiveApplicationsFor(applicantToken: string, applicantId: string) {
      const activeApps = await db.query.clubApplications.findMany({
        where: {
          applicantId,
          status: { in: ["pending", "revision_requested"] },
        },
      });
      for (const app of activeApps) {
        if (app.status === "revision_requested") {
          await patch(`/api/clubs/applications/${app.id}/resubmit`, applicantToken, {
            proposedName: `Temizlik ${Date.now()}`,
            description: "Test temizliği.",
          });
        }
        await reqAuth("DELETE", `/api/clubs/applications/${app.id}`, applicantToken);
      }
    }

    it("başka tenant admin revizyon isteyemez", async () => {
      const antalyaAdmin = await login("elif.demir@antalya.edu.tr");
      const antalyaUni = (await me(antalyaAdmin)).universityId as string;
      await setTenantFormationThreshold(antalyaUni, 0, (await me(antalyaAdmin)).userId as string);
      await useClubApproverChainForTests(antalyaUni, (await me(antalyaAdmin)).userId as string);
      const demo = await login("demo.yk2@std.antalya.edu.tr");
      const demoId = (await me(demo)).userId;
      await clearActiveApplicationsFor(demo, demoId);

      const createRes = await reqAuth("POST", "/api/clubs/applications", demo, {
        proposedName: `Tenant Rev ${Date.now()}`,
        description: "Tenant test.",
      });
      expect(createRes.status).toBe(201);
      const appId = (await createRes.json()).data.id as string;

      const egeAdmin = await login("okan.yildiz@egebilim.edu.tr");
      const egeUni = (await me(egeAdmin)).universityId as string;

      expect(
        (await patch(
          `/api/admin/universities/${egeUni}/club-applications/${appId}/request-revision`,
          egeAdmin,
          { note: "Tenant sızıntısı denemesi — geçersiz olmalı." }
        )).status
      ).toBe(404);

      expect(
        (await patch(
          `/api/admin/universities/${antalyaUni}/club-applications/${appId}/request-revision`,
          antalyaAdmin,
          { note: "Antalya tenant içi revizyon talebi geçerli." }
        )).status
      ).toBe(200);

      await clearActiveApplicationsFor(demo, demoId);
      await restoreAntalyaSeedApprovalChain(antalyaUni, (await me(antalyaAdmin)).userId as string);
    });
  });
});
