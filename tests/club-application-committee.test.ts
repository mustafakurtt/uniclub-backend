/**
 * Kurul oylaması (T4.2 — committee_majority) — salt çoğunluk, karışık zincir, denetim.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { login, me, reqAuth, get, data } from "./helpers";
import { db } from "../src/db";
import {
  clubApplicationApprovals,
  clubApplicationCommitteeVotes,
  tenantSettings,
} from "../src/db/schema";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";
import { invalidateTenantSettingsCache } from "../src/features/tenant-settings/tenant-settings.cache";
import {
  restoreAntalyaSeedApprovalChain,
  restoreAntalyaSeedFormationThreshold,
  setTenantFormationThreshold,
} from "./tenant-test-helpers";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

const post = (path: string, token: string, body?: unknown) =>
  reqAuth("POST", path, token, body);

async function auditItems(token: string, universityId: string) {
  const items = await data<{ items: Array<{
    action: string;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
  }> }>(await get(`/api/audit/universities/${universityId}?limit=100`, token));
  return items.items;
}

describe("kurul oylaması (committee_majority)", () => {
  const voterEmails = [
    "sks@antalya.edu.tr",
    "ahmet.hoca@antalya.edu.tr",
    "zeynep.aydin@antalya.edu.tr",
    "murat.tekin@antalya.edu.tr",
    "moderator@antalya.edu.tr",
  ];

  let uni: string;
  let admin: string;
  let outsiderToken: string;
  let committeeId: string;
  let voterTokens: string[] = [];
  const applicantEmails = [
    "demo.yk1@std.antalya.edu.tr",
    "demo.yk2@std.antalya.edu.tr",
    "demo.yk3@std.antalya.edu.tr",
    "demo.yk4@std.antalya.edu.tr",
    "demo.yk5@std.antalya.edu.tr",
    "demo.yk6@std.antalya.edu.tr",
    "demo.basvuru1@std.antalya.edu.tr",
    "demo.basvuru2@std.antalya.edu.tr",
  ];
  let applicantIdx = 0;

  async function setApprovalChain(chain: unknown) {
    await db
      .insert(tenantSettings)
      .values({
        universityId: uni,
        key: TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN,
        value: chain,
        updatedBy: (await me(admin)).userId as string,
      })
      .onConflictDoUpdate({
        target: [tenantSettings.universityId, tenantSettings.key],
        set: { value: chain, updatedAt: new Date() },
      });
    await invalidateTenantSettingsCache(uni);
  }

  async function clearApprovalChainOverride() {
    await restoreAntalyaSeedApprovalChain(uni, (await me(admin)).userId as string);
  }

  async function createApplication(name: string) {
    for (let attempt = 0; attempt < applicantEmails.length; attempt++) {
      const email = applicantEmails[applicantIdx % applicantEmails.length];
      applicantIdx++;
      const token = await login(email);
      const res = await reqAuth("POST", "/api/clubs/applications", token, {
        proposedName: name,
        description: "Kurul oylaması test başvurusu.",
      });
      if (res.status === 201) {
        return (await res.json()).data.id as string;
      }
      if (res.status === 400) continue;
      expect(res.status).toBe(201);
    }
    throw new Error("Uygun başvuran bulunamadı (tüm öğrencilerde aktif başvuru var).");
  }

  const voteUrl = (applicationId: string) =>
    `/api/admin/universities/${uni}/club-applications/${applicationId}/committee-vote`;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr");
    uni = (await me(admin)).universityId as string;
    outsiderToken = await login("burak.demirci@std.antalya.edu.tr");

    await setTenantFormationThreshold(uni, 0, (await me(admin)).userId as string);

    voterTokens = await Promise.all(voterEmails.map((email) => login(email)));

    const seedCommittee = await db.query.approvalCommittees.findFirst({
      where: { universityId: uni, name: "Koordinasyon Kurulu" },
    });
    if (!seedCommittee) throw new Error("seed: Koordinasyon Kurulu yok");
    committeeId = seedCommittee.id;
  });

  afterAll(async () => {
    const actorId = (await me(admin)).userId as string;
    await clearApprovalChainOverride();
    await restoreAntalyaSeedFormationThreshold(uni, actorId);
  });

  it("5 üyeli kurul: 2 onay → karar yok · 3 onay → onaylandı", async () => {
    await setApprovalChain([{ type: "committee_majority", committeeId }]);
    const applicationId = await createApplication(`Kurul Çoğunluk ${Date.now()}`);

    const vote1 = await patch(voteUrl(applicationId), voterTokens[0], { vote: "approve" });
    expect(vote1.status).toBe(200);
    const body1 = await vote1.json();
    expect(body1.data.finalized).toBe(false);

    const vote2 = await patch(voteUrl(applicationId), voterTokens[1], { vote: "approve" });
    expect(vote2.status).toBe(200);
    const body2 = await vote2.json();
    expect(body2.data.finalized).toBe(false);

    const appMid = await db.query.clubApplications.findFirst({ where: { id: applicationId } });
    expect(appMid?.status).toBe("pending");

    const vote3 = await patch(voteUrl(applicationId), voterTokens[2], { vote: "approve" });
    expect(vote3.status).toBe(200);
    const body3 = await vote3.json();
    expect(body3.data.finalized).toBe(true);
    expect(body3.data.decision).toBe("approved");
    expect(body3.data.result.application.status).toBe("approved");
    expect(body3.data.result.club).toBeTruthy();
  });

  it("3 ret → reddedildi", async () => {
    await setApprovalChain([{ type: "committee_majority", committeeId }]);
    const applicationId = await createApplication(`Kurul Ret ${Date.now()}`);

    for (let i = 0; i < 3; i++) {
      const res = await patch(voteUrl(applicationId), voterTokens[i], {
        vote: "reject",
        reason: "Kurul ret test gerekçesi yeterli uzunlukta.",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      if (i < 2) {
        expect(body.data.finalized).toBe(false);
      } else {
        expect(body.data.finalized).toBe(true);
        expect(body.data.decision).toBe("rejected");
      }
    }

    const appRow = await db.query.clubApplications.findFirst({ where: { id: applicationId } });
    expect(appRow?.status).toBe("rejected");
  });

  it("kurul üyesi olmayan oy veremez (403)", async () => {
    await setApprovalChain([{ type: "committee_majority", committeeId }]);
    const applicationId = await createApplication(`Kurul Yetki ${Date.now()}`);

    const res = await patch(voteUrl(applicationId), outsiderToken, { vote: "approve" });
    expect(res.status).toBe(403);
  });

  it("karışık zincir: kurul geçince sıradaki kademeye düşer", async () => {
    const sksToken = voterTokens[0];
    await setApprovalChain([
      { type: "committee_majority", committeeId },
      { type: "role_sequential", role: "student_affairs" },
    ]);
    const applicationId = await createApplication(`Karışık Zincir ${Date.now()}`);

    for (let i = 0; i < 3; i++) {
      expect(
        (await patch(voteUrl(applicationId), voterTokens[i], { vote: "approve" })).status
      ).toBe(200);
    }

    const midApp = await db.query.clubApplications.findFirst({ where: { id: applicationId } });
    expect(midApp?.status).toBe("pending");

    const approvals = await db
      .select()
      .from(clubApplicationApprovals)
      .where(eq(clubApplicationApprovals.applicationId, applicationId));
    expect(approvals.find((a) => a.step === 1)?.status).toBe("approved");
    expect(approvals.find((a) => a.step === 2)?.status).toBe("pending");

    const finalRes = await patch(
      `/api/admin/universities/${uni}/club-applications/${applicationId}/approve`,
      sksToken
    );
    expect(finalRes.status).toBe(200);
    const finalBody = await finalRes.json();
    expect(finalBody.data.application.status).toBe("approved");
    expect(finalBody.data.club).toBeTruthy();
  });

  it("çapraz tenant kurul referansı → 404", async () => {
    const egeAdmin = await login("okan.yildiz@egebilim.edu.tr");
    const egeUni = (await me(egeAdmin)).universityId as string;

    const fakeId = "00000000-0000-4000-8000-000000000099";
    const res = await patch(
      `/api/admin/universities/${egeUni}/club-applications/${fakeId}/committee-vote`,
      egeAdmin,
      { vote: "approve" }
    );
    expect(res.status).toBe(404);

    await setApprovalChain([{ type: "committee_majority", committeeId }]);
    const applicationId = await createApplication(`Tenant İzolasyon ${Date.now()}`);

    expect(
      (
        await patch(
          `/api/admin/universities/${egeUni}/club-applications/${applicationId}/committee-vote`,
          egeAdmin,
          { vote: "approve" }
        )
      ).status
    ).toBe(404);
  });

  it("oylar audit_logs'a düşer", async () => {
    await setApprovalChain([{ type: "committee_majority", committeeId }]);
    const applicationId = await createApplication(`Kurul Audit ${Date.now()}`);

    expect(
      (await patch(voteUrl(applicationId), voterTokens[0], { vote: "approve" })).status
    ).toBe(200);

    const logs = await auditItems(admin, uni);
    const voteLog = logs.find(
      (l) =>
        l.action === "club.application.committee_vote.approve" &&
        l.targetId === applicationId
    );
    expect(voteLog).toBeTruthy();
  });

  it("üye oyunu karar kesinleşmeden değiştirebilir", async () => {
    await setApprovalChain([{ type: "committee_majority", committeeId }]);
    const applicationId = await createApplication(`Oy Değiştir ${Date.now()}`);

    expect(
      (await patch(voteUrl(applicationId), voterTokens[0], { vote: "approve" })).status
    ).toBe(200);
    expect(
      (
        await patch(voteUrl(applicationId), voterTokens[0], {
          vote: "reject",
          reason: "Oy değiştirme test gerekçesi yeterli.",
        })
      ).status
    ).toBe(200);

    const votes = await db.query.clubApplicationCommitteeVotes.findMany({
      where: { applicationId, voterUserId: (await me(voterTokens[0])).userId as string },
    });
    expect(votes[0]?.vote).toBe("reject");
  });
});
