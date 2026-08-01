/**
 * Kurul oy tally okuma yüzeyi — başvuru detay + tek kurul GET.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { login, me, reqAuth, get, data } from "./helpers";
import { db } from "../src/db";
import {
  restoreAntalyaSeedApprovalChain,
  restoreAntalyaSeedFormationThreshold,
  setTenantFormationThreshold,
} from "./tenant-test-helpers";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

describe("kurul oy tally okuma", () => {
  let uni: string;
  let adminToken: string;
  let nonMemberAdminToken: string;
  let studentToken: string;
  let sksToken: string;
  let committeeId: string;
  let partialAppId: string;
  let voterTokens: string[] = [];

  const voterEmails = [
    "sks@antalya.edu.tr",
    "ahmet.hoca@antalya.edu.tr",
    "zeynep.aydin@antalya.edu.tr",
  ];

  beforeAll(async () => {
    adminToken = await login("sks@antalya.edu.tr");
    nonMemberAdminToken = await login("elif.demir@antalya.edu.tr");
    studentToken = await login("demo.basvuru2@std.antalya.edu.tr");
    sksToken = adminToken;
    uni = (await me(adminToken)).universityId as string;

    await setTenantFormationThreshold(uni, 0, (await me(adminToken)).userId as string);
    voterTokens = await Promise.all(voterEmails.map((email) => login(email)));

    const committee = await db.query.approvalCommittees.findFirst({
      where: { universityId: uni, name: "Koordinasyon Kurulu" },
    });
    if (!committee) throw new Error("seed: Koordinasyon Kurulu yok");
    committeeId = committee.id;

    const partialApp = await db.query.clubApplications.findFirst({
      where: { universityId: uni, proposedName: "Robotik ve Otomasyon Kulübü", status: "pending" },
      columns: { id: true },
    });
    if (!partialApp) throw new Error("seed: Robotik ve Otomasyon başvurusu yok");
    partialAppId = partialApp.id;
  });

  afterAll(async () => {
    const actorId = (await me(adminToken)).userId as string;
    await restoreAntalyaSeedApprovalChain(uni, actorId);
    await restoreAntalyaSeedFormationThreshold(uni, actorId);
  });

  it("admin detay → kurul kademesinde tally ve bireysel oylar", async () => {
    const application = await data<{
      approvals: Array<{
        stepKind: string;
        committeeTally: {
          committeeId: string;
          committeeName: string;
          memberCount: number;
          requiredApprovals: number;
          approveCount: number;
          rejectCount: number;
          notVotedCount: number;
          votes: Array<{ vote: string; voterUserId: string }>;
          myVote: { vote: string } | null;
          notVotedMembers: Array<{ id: string; firstName: string }>;
        } | null;
      }>;
    }>(
      await get(`/api/admin/universities/${uni}/club-applications/${partialAppId}`, adminToken)
    );

    const step = application.approvals.find((a) => a.stepKind === "committee_majority");
    expect(step?.committeeTally).toBeTruthy();
    const tally = step!.committeeTally!;
    expect(tally.committeeId).toBe(committeeId);
    expect(tally.committeeName).toBe("Koordinasyon Kurulu");
    expect(tally.memberCount).toBe(5);
    expect(tally.requiredApprovals).toBe(3);
    expect(tally.approveCount).toBe(2);
    expect(tally.rejectCount).toBe(0);
    expect(tally.notVotedCount).toBe(3);
    expect(tally.votes.length).toBe(2);
    expect(tally.myVote).toBeTruthy();
    expect(tally.notVotedMembers.length).toBe(3);
    expect(tally.notVotedMembers.every((m) => m.firstName && m.id)).toBe(true);
  });

  it("ikinci GET → aynı tally (sayfa yenileme simülasyonu)", async () => {
    const fetchDetail = async () =>
      data<{ approvals: Array<{ committeeTally: Record<string, unknown> | null }> }>(
        await get(`/api/admin/universities/${uni}/club-applications/${partialAppId}`, adminToken)
      );

    const first = await fetchDetail();
    const second = await fetchDetail();
    const tally1 = first.approvals.find((a) => a.committeeTally)?.committeeTally;
    const tally2 = second.approvals.find((a) => a.committeeTally)?.committeeTally;
    expect(tally2).toEqual(tally1);
  });

  it("kurul üyesi olmayan admin → tam bireysel oy listesi", async () => {
    const application = await data<{
      approvals: Array<{
        committeeTally: { votes: Array<{ voterUserId: string }> } | null;
      }>;
    }>(
      await get(`/api/admin/universities/${uni}/club-applications/${partialAppId}`, nonMemberAdminToken)
    );
    const tally = application.approvals.find((a) => a.committeeTally)?.committeeTally;
    expect(tally?.votes?.length).toBe(2);
  });

  it("öğrenci detay → tally özeti, bireysel oy yok", async () => {
    const application = await data<{
      approvals: Array<{
        committeeTally: Record<string, unknown> | null;
      }>;
    }>(await get(`/api/clubs/applications/${partialAppId}`, studentToken));

    const tally = application.approvals.find((a) => a.committeeTally)?.committeeTally;
    expect(tally).toBeTruthy();
    expect(tally!.committeeName).toBe("Koordinasyon Kurulu");
    expect(tally!.memberCount).toBe(5);
    expect(tally!.requiredApprovals).toBe(3);
    expect(tally!.approveCount).toBe(2);
    expect("votes" in tally!).toBe(false);
    expect("myVote" in tally!).toBe(false);
    expect("notVotedMembers" in tally!).toBe(false);
  });

  it("oy verildikten sonra detay tally güncellenir", async () => {
    const applicantToken = await login("demo.yk4@std.antalya.edu.tr");
    const applicationId = (
      await data<{ id: string }>(
        await reqAuth("POST", "/api/clubs/applications", applicantToken, {
          proposedName: `Tally Oy Test ${Date.now()}`,
          description: "Tally okuma testi.",
        })
      )
    ).id;

    const voteRes = await patch(
      `/api/admin/universities/${uni}/club-applications/${applicationId}/committee-vote`,
      voterTokens[0],
      { vote: "approve" }
    );
    expect(voteRes.status).toBe(200);

    const detail = await data<{
      approvals: Array<{
        committeeTally: { approveCount: number; votes: Array<{ vote: string }> } | null;
      }>;
    }>(await get(`/api/admin/universities/${uni}/club-applications/${applicationId}`, adminToken));

    const tally = detail.approvals.find((a) => a.committeeTally)?.committeeTally;
    expect(tally?.approveCount).toBe(1);
    expect(tally?.votes.some((v) => v.vote === "approve")).toBe(true);
  });

  it("GET approval-committees/:committeeId → application.view ile erişim", async () => {
    const committee = await data<{ id: string; name: string }>(
      await get(`/api/admin/universities/${uni}/approval-committees/${committeeId}`, sksToken)
    );
    expect(committee.id).toBe(committeeId);
    expect(committee.name).toBe("Koordinasyon Kurulu");
  });

  it("çapraz tenant kurul GET → 404", async () => {
    const egeAdmin = await login("okan.yildiz@egebilim.edu.tr");
    const egeUni = (await me(egeAdmin)).universityId as string;
    expect(
      (await get(`/api/admin/universities/${egeUni}/approval-committees/${committeeId}`, egeAdmin)).status
    ).toBe(404);
  });
});
