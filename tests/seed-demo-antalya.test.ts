/**
 * Antalya demo seed doğrulaması — Yazılım kulübü derinliği ve Koordinasyon Kurulu.
 */
import { describe, it, expect } from "bun:test";
import { db } from "../src/db";
import {
  antalyaUniversityId,
} from "./tenant-test-helpers";
import {
  approvalCommittees,
  approvalCommitteeMembers,
  clubApplicationApprovals,
  clubApplicationCommitteeVotes,
  clubBoardMemberships,
  tenantSettings,
} from "../src/db/schema";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";
import { parseApprovalChainSteps } from "../src/features/clubs/club-application-chain.core";

describe("Antalya demo seed", () => {
  it("Yazılım kulübünde 5 asil + 5 yedek yönetim kurulu", async () => {
    const universityId = await antalyaUniversityId();
    const club = await db.query.clubs.findFirst({
      where: { slug: "yazilim-teknoloji", universityId },
    });
    if (!club) throw new Error("seed eksik: yazilim-teknoloji");

    const rows = await db.query.clubBoardMemberships.findMany({
      where: {
        clubId: club.id,
        boardType: "management",
        endedAt: { isNull: true },
      },
    });

    expect(rows.filter((r) => r.seatType === "principal").length).toBe(5);
    expect(rows.filter((r) => r.seatType === "alternate").length).toBe(5);
  });

  it("Antalya zinciri committee_majority, Koordinasyon Kurulu 5 üyeli", async () => {
    const uni = await db.query.universities.findFirst({ where: { slug: "antalya-bilim" } });
    if (!uni) throw new Error("seed eksik: antalya-bilim");

    const chainRow = await db.query.tenantSettings.findFirst({
      where: {
        universityId: uni.id,
        key: TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN,
      },
    });
    const chain = parseApprovalChainSteps(chainRow?.value);
    expect(chain).toBeTruthy();
    expect(chain![0].type).toBe("committee_majority");

    const committee = await db.query.approvalCommittees.findFirst({
      where: { universityId: uni.id, name: "Koordinasyon Kurulu" },
    });
    if (!committee) throw new Error("seed eksik: Koordinasyon Kurulu");

    const members = await db.query.approvalCommitteeMembers.findMany({
      where: { committeeId: committee.id },
    });
    expect(members.length).toBe(5);
  });

  it("kısmen oy verilmiş başvuru pending (2 onay < 3)", async () => {
    const uni = await db.query.universities.findFirst({ where: { slug: "antalya-bilim" } });
    if (!uni) throw new Error("seed eksik: antalya-bilim");

    const app = await db.query.clubApplications.findFirst({
      where: { universityId: uni.id, proposedName: "Robotik ve Otomasyon Kulübü" },
    });
    if (!app) throw new Error("seed eksik: Robotik ve Otomasyon başvurusu");
    expect(app.status).toBe("pending");

    const votes = await db.query.clubApplicationCommitteeVotes.findMany({
      where: { applicationId: app.id, vote: "approve" },
    });
    expect(votes.length).toBe(2);

    const approval = await db.query.clubApplicationApprovals.findFirst({
      where: { applicationId: app.id, step: 1 },
    });
    expect(approval?.status).toBe("pending");
  });
});
