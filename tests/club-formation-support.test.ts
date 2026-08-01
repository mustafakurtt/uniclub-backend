/**
 * Kuruluş dijital destek toplama (T1.1) — tenant kapalı/açık, eşik, geri çekme, bildirim, izolasyon.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { login, me, reqAuth, data, get } from "./helpers";
import { db } from "../src/db";
import { clubApplications, clubFormationProposals, notifications } from "../src/db/schema";
import { NotificationType } from "../src/features/notifications/notifications.types";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

async function clearActiveForStudent(email: string) {
  const token = await login(email);
  const userId = (await me(token)).userId;
  const uniId = (await me(token)).universityId as string;

  const activeApps = await db.query.clubApplications.findMany({
    where: {
      applicantId: userId,
      status: { in: ["pending", "revision_requested"] },
    },
  });
  for (const app of activeApps) {
    await reqAuth("DELETE", `/api/clubs/applications/${app.id}`, token);
  }

  const activeProposals = await db.query.clubFormationProposals.findMany({
    where: {
      proposerId: userId,
      status: "collecting_support",
    },
  });
  for (const p of activeProposals) {
    await reqAuth("DELETE", `/api/clubs/formation-proposals/${p.id}`, token);
  }

  return { token, userId, uniId };
}

describe("kuruluş dijital destek toplama", () => {
  describe("açık tenant (Antalya — eşik 8)", () => {
    let antalyaUni: string;
    let admin: string;

    beforeAll(async () => {
      admin = await login("elif.demir@antalya.edu.tr");
      antalyaUni = (await me(admin)).universityId as string;
    });

    it("POST /applications kuruluş önerisi oluşturur", async () => {
      const burak = await clearActiveForStudent("burak.demirci@std.antalya.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", burak.token, {
        proposedName: `Antalya Destek ${Date.now()}`,
        description: "Destek toplama testi (eşik 8).",
      });
      expect(createRes.status).toBe(201);
      const body = await createRes.json();
      expect(body.data.kind).toBe("formation_proposal");
      expect(body.data.status).toBe("collecting_support");
    });
  });

  describe("kapalı tenant (Ege — eşik 0)", () => {
    it("POST /applications doğrudan pending başvuru oluşturur", async () => {
      const cem = await clearActiveForStudent("cem.arslan@std.egebilim.edu.tr");
      const uni = cem.uniId;

      const createRes = await reqAuth("POST", "/api/clubs/applications", cem.token, {
        proposedName: `Ege Doğrudan ${Date.now()}`,
        description: "Destek kapalı tenant testi.",
      });
      expect(createRes.status).toBe(201);
      const body = await createRes.json();
      expect(body.data.kind).toBe("application");
      expect(body.data.status).toBe("pending");

      const app = await db.query.clubApplications.findFirst({
        where: { id: body.data.id, universityId: uni },
      });
      expect(app?.status).toBe("pending");
    });
  });

  describe("açık tenant (Karadeniz — eşik 3)", () => {
    let kartekUni: string;
    let admin: string;

    beforeAll(async () => {
      admin = await login("hulya.ozkan@kartek.edu.tr");
      kartekUni = (await me(admin)).universityId as string;
    });

    it("öneri destek aşamasında; eşik altında onay kuyruğuna düşmüyor", async () => {
      const yusuf = await clearActiveForStudent("yusuf.celik@std.kartek.edu.tr");
      const merve = await clearActiveForStudent("merve.acar@std.kartek.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", yusuf.token, {
        proposedName: `Robotik Kulüp ${Date.now()}`,
        description: "Destek toplama testi.",
      });
      expect(createRes.status).toBe(201);
      const proposal = (await createRes.json()).data;
      expect(proposal.kind).toBe("formation_proposal");
      expect(proposal.status).toBe("collecting_support");
      expect(proposal.supportCount).toBe(0);

      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposal.id}/support`, merve.token)).status
      ).toBe(200);

      const pendingApps = await data<Array<{ proposedName: string }>>(
        await get(`/api/admin/universities/${kartekUni}/club-applications?status=pending`, admin)
      );
      expect(pendingApps.some((a) => a.proposedName === proposal.proposedName)).toBe(false);

      const collecting = await data<Array<{ id: string }>>(
        await get(`/api/admin/universities/${kartekUni}/formation-proposals?status=collecting_support`, admin)
      );
      expect(collecting.some((p) => p.id === proposal.id)).toBe(true);
    });

    it("eşik aşıldığında zincire düşer; bildirim bir kez", async () => {
      const yusuf = await clearActiveForStudent("yusuf.celik@std.kartek.edu.tr");
      const merve = await clearActiveForStudent("merve.acar@std.kartek.edu.tr");
      const hakan = await clearActiveForStudent("hakan.turan@std.kartek.edu.tr");
      const esra = await login("esra.bulut@std.kartek.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", yusuf.token, {
        proposedName: `Eşik Test ${Date.now()}`,
        description: "Üç destek sonrası zincir.",
      });
      const proposal = (await createRes.json()).data;
      const proposalId = proposal.id as string;

      const beforeNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, yusuf.userId));
      const beforeThreshold = beforeNotifs.filter(
        (n) => n.type === NotificationType.CLUB_FORMATION_THRESHOLD_REACHED
      ).length;

      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, merve.token)).status
      ).toBe(200);
      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, hakan.token)).status
      ).toBe(200);

      const thirdRes = await reqAuth(
        "POST",
        `/api/clubs/formation-proposals/${proposalId}/support`,
        esra
      );
      expect(thirdRes.status).toBe(200);
      const thirdBody = await thirdRes.json();
      expect(thirdBody.data.thresholdReached).toBe(true);
      expect(thirdBody.data.application?.status).toBe("pending");

      const pendingApps = await data<Array<{ id: string; proposedName: string }>>(
        await get(`/api/admin/universities/${kartekUni}/club-applications?status=pending`, admin)
      );
      expect(pendingApps.some((a) => a.proposedName === proposal.proposedName)).toBe(true);

      const afterNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, yusuf.userId));
      const afterThreshold = afterNotifs.filter(
        (n) => n.type === NotificationType.CLUB_FORMATION_THRESHOLD_REACHED
      ).length;
      expect(afterThreshold).toBe(beforeThreshold + 1);

      const perSupportNotifs = afterNotifs.filter((n) => n.type === NotificationType.CLUB_FORMATION_THRESHOLD_REACHED);
      expect(perSupportNotifs.length).toBe(beforeThreshold + 1);
    });

    it("aynı kişi iki kez destekleyemez", async () => {
      const yusuf = await clearActiveForStudent("yusuf.celik@std.kartek.edu.tr");
      const merve = await clearActiveForStudent("merve.acar@std.kartek.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", yusuf.token, {
        proposedName: `Çift Destek ${Date.now()}`,
        description: "Tek destek kuralı.",
      });
      const proposalId = (await createRes.json()).data.id as string;

      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, merve.token)).status
      ).toBe(200);
      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, merve.token)).status
      ).toBe(400);
    });

    it("destek geri çekilebilir; eşik altına düşer", async () => {
      const yusuf = await clearActiveForStudent("yusuf.celik@std.kartek.edu.tr");
      const merve = await clearActiveForStudent("merve.acar@std.kartek.edu.tr");
      const hakan = await clearActiveForStudent("hakan.turan@std.kartek.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", yusuf.token, {
        proposedName: `Geri Çekme ${Date.now()}`,
        description: "Destek geri çekme testi.",
      });
      const proposalId = (await createRes.json()).data.id as string;

      await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, merve.token);
      await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, hakan.token);

      const withdrawRes = await reqAuth(
        "DELETE",
        `/api/clubs/formation-proposals/${proposalId}/support`,
        hakan.token
      );
      expect(withdrawRes.status).toBe(200);
      const body = await withdrawRes.json();
      expect(body.data.supportCount).toBe(1);

      const detail = await data<{ status: string; supportCount: number }>(
        await get(`/api/clubs/formation-proposals/${proposalId}`, yusuf.token)
      );
      expect(detail.status).toBe("collecting_support");
      expect(detail.supportCount).toBe(1);
    });

    it("hasSupported — destek ve geri çekme listede ve detayda yansır", async () => {
      const yusuf = await clearActiveForStudent("yusuf.celik@std.kartek.edu.tr");
      const merve = await clearActiveForStudent("merve.acar@std.kartek.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", yusuf.token, {
        proposedName: `Has Supported ${Date.now()}`,
        description: "hasSupported sözleşmesi.",
      });
      const proposalId = (await createRes.json()).data.id as string;

      let detail = await data<{ hasSupported: boolean }>(
        await get(`/api/clubs/formation-proposals/${proposalId}`, merve.token)
      );
      expect(detail.hasSupported).toBe(false);

      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, merve.token)).status
      ).toBe(200);

      const list = await data<Array<{ id: string; hasSupported: boolean }>>(
        await get("/api/clubs/formation-proposals", merve.token)
      );
      const row = list.find((p) => p.id === proposalId);
      expect(row?.hasSupported).toBe(true);

      detail = await data<{ hasSupported: boolean }>(
        await get(`/api/clubs/formation-proposals/${proposalId}`, merve.token)
      );
      expect(detail.hasSupported).toBe(true);

      expect(
        (await reqAuth("DELETE", `/api/clubs/formation-proposals/${proposalId}/support`, merve.token)).status
      ).toBe(200);

      detail = await data<{ hasSupported: boolean }>(
        await get(`/api/clubs/formation-proposals/${proposalId}`, merve.token)
      );
      expect(detail.hasSupported).toBe(false);
    });

    it("öneri sahibi kendi önerisini destekleyemez", async () => {
      const yusuf = await clearActiveForStudent("yusuf.celik@std.kartek.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", yusuf.token, {
        proposedName: `Kendi Destek ${Date.now()}`,
        description: "Self support engeli.",
      });
      const proposalId = (await createRes.json()).data.id as string;

      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, yusuf.token)).status
      ).toBe(400);
    });

    it("tenant izolasyonu — başka üniversite destekleyemez", async () => {
      const yusuf = await clearActiveForStudent("yusuf.celik@std.kartek.edu.tr");
      const antalyaStudent = await login("mustafa.kurt@std.antalya.edu.tr");

      const createRes = await reqAuth("POST", "/api/clubs/applications", yusuf.token, {
        proposedName: `Tenant Destek ${Date.now()}`,
        description: "Tenant izolasyonu.",
      });
      const proposalId = (await createRes.json()).data.id as string;

      expect(
        (await reqAuth("POST", `/api/clubs/formation-proposals/${proposalId}/support`, antalyaStudent)).status
      ).toBe(404);
    });
  });
});
