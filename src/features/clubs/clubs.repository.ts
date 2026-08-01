import { eq, and, asc, gt, lt } from "drizzle-orm";
import { db } from "../../db";
import {
  clubs,
  clubMembers,
  clubContactLinks,
  clubApplications,
  clubApplicationApprovals,
  clubApplicationEvents,
  clubFormationProposals,
  clubFormationSupports,
} from "../../db/schema";
import { BaseRepository, type Database } from "../../core/db";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { buildApprovalInsertRows, parseApprovalChain, DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN, type ApprovalChainRoleToken } from "./club-application-chain.core";
import {
  CreateClubApplicationPayload,
  CreateContactLinkPayload,
  UpdateOwnClubPayload,
} from "./clubs.types";

/**
 * Kulüp veri erişimi. Birincil tablo `clubs` — BaseRepository'yi extend eder ve
 * clubs-tablosu işlerini (`findOne`/`findById`/`updateById`) tabandan alır.
 *
 * `id` taşıyan yan tablolar (`clubContactLinks`, `clubApplications`) modül düzeyinde
 * hafif BaseRepository örnekleriyle composite-where helper'larından yararlanır.
 * `clubMembers` BİLEŞİK anahtarlı (id yok) olduğu için BaseRepository kapsamı dışında
 * kalır — üyelik metodları ham Drizzle ile yazılır. Çok-adımlı işlemler transaction'da.
 */
const contactLinksRepo = new BaseRepository(db, clubContactLinks);
const applicationsRepo = new BaseRepository(db, clubApplications);

class ClubsRepository extends BaseRepository<typeof clubs, typeof db.query.clubs> {
  constructor() {
    super(db, clubs, { query: db.query.clubs });
  }

  // ── clubs tablosu ────────────────────────────────────────────────────────
  findApprovedClubsByUniversity(universityId: string, search?: string) {
    return this.query!.findMany({
      where: {
        universityId,
        status: "approved",
        ...(search ? { name: { ilike: `%${search}%` } } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  findClubDetail(universityId: string, clubId: string) {
    return this.query!.findFirst({
      where: { id: clubId, universityId },
      with: {
        advisors: true,
        clubMembers: {
          where: { status: "approved" },
          with: { user: true },
        },
        contactLinks: true,
      },
    });
  }

  /**
   * findClubDetail'in tenant filtresi OLMAYAN varyantı — clubId zaten global
   * benzersiz. Cache clubId ile anahtarlanır (universityId anahtarda taşınamadığı
   * invalidasyon yollarıyla tutarlı olsun diye); tenant doğrulaması cache DIŞINDA,
   * dönen `universityId` karşılaştırılarak service'te yapılır (çapraz-tenant sızıntı yok).
   */
  findClubDetailById(clubId: string) {
    return this.query!.findFirst({
      where: { id: clubId },
      with: {
        advisors: true,
        clubMembers: {
          where: { status: "approved" },
          with: { user: true },
        },
        contactLinks: true,
      },
    });
  }

  findClubInUniversity(universityId: string, clubId: string) {
    return this.findOne({ id: clubId, universityId });
  }

  /**
   * Tenant filtresi OLMADAN kulüp getirir. Yalnızca kulübün kimliği zaten
   * doğrulanmış akışlarda (kulüp-içi yetki middleware'inden geçmiş rotalar)
   * bildirim metni gibi yardımcı veriler için kullanılır.
   */
  findClubById(clubId: string) {
    return this.findById(clubId);
  }

  /** Başkanın kendi kulübünün profilini güncellemesi (status hariç). */
  updateOwnClub(clubId: string, data: UpdateOwnClubPayload) {
    return this.updateById(clubId, data);
  }

  // ── clubMembers (bileşik anahtar → ham Drizzle) ──────────────────────────
  /**
   * Kulübün onaylı ve HÂLÂ ÜYE olanları. `leftAt: null` filtresi şart: ayrılma
   * artık satırı silmiyor, işaretliyor (bkz. schema → clubMembers.leftAt).
   * Bu filtreyi unutmak, ayrılmış üyeleri listede göstermek demektir.
   */
  findApprovedMembers(clubId: string) {
    return db.query.clubMembers.findMany({
      where: { clubId, status: "approved", leftAt: { isNull: true } },
      with: { user: true },
      orderBy: { joinedAt: "asc" },
    });
  }

  /** AKTİF üyelik (ayrılmışlar hariç) — yetki ve "zaten üyesin" kontrolleri için. */
  findMembership(clubId: string, userId: string) {
    return db.query.clubMembers.findFirst({
      where: { clubId, userId, leftAt: { isNull: true } },
    });
  }

  /** Ayrılmışlar dahil ham satır — yeniden katılımda satırı geri diriltmek için. */
  findMembershipRow(clubId: string, userId: string) {
    return db.query.clubMembers.findFirst({
      where: { clubId, userId },
    });
  }

  // universityId zorunlu: satır hem kulübe hem kullanıcıya BİLEŞİK FK ile bağlı
  // (bkz. db/schema.ts → clubMembers). Yanlış tenant verilirse DB reddeder.
  async addMembership(
    clubId: string,
    userId: string,
    universityId: string,
    status: "approved" | "pending"
  ) {
    // Birincil anahtar (club_id, user_id) olduğu için daha önce ayrılmış bir üye
    // için İKİNCİ satır açılamaz — o satır yeniden kullanılır (leftAt sıfırlanır,
    // joinedAt yenilenir). Çoklu giriş-çıkış tarihçesinin neden tutulamadığı ve
    // ne zaman çözüleceği için bkz. schema → clubMembers.leftAt.
    const [row] = await db
      .insert(clubMembers)
      .values({ clubId, userId, universityId, role: "member", status })
      .onConflictDoUpdate({
        target: [clubMembers.clubId, clubMembers.userId],
        set: { status, role: "member", leftAt: null, joinedAt: new Date() },
      })
      .returning();
    return row;
  }

  /**
   * Üyelikten ayrılma. Satırı SİLMEZ, `leftAt` damgalar — geçmiş kaybolmasın
   * (bkz. schema → clubMembers.leftAt). Reddedilen katılım isteklerinde de aynı
   * yol kullanılır: "istek reddedildi" bilgisi de bir kayıttır.
   */
  async removeMembership(clubId: string, userId: string) {
    await db
      .update(clubMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)));
  }

  /** Bekleyen katılım istekleri — vazgeçip ayrılanlar (leftAt dolu) hariç. */
  findPendingJoinRequests(clubId: string) {
    return db.query.clubMembers.findMany({
      where: { clubId, status: "pending", leftAt: { isNull: true } },
      with: { user: true },
    });
  }

  async updateMembershipStatus(clubId: string, userId: string, status: "approved" | "rejected") {
    const [updated] = await db.update(clubMembers)
      .set({ status })
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .returning();
    return updated;
  }

  async updateMembershipRole(clubId: string, userId: string, role: "member" | "officer" | "president") {
    const [updated] = await db.update(clubMembers)
      .set({ role })
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .returning();
    return updated;
  }

  /**
   * Başkanlık devri: mevcut başkanı officer'a düşürüp hedef üyeyi başkan yapar,
   * tek transaction'da (yarım kalırsa iki başkanlı/başkansız kulüp olmasın).
   */
  transferPresidency(clubId: string, currentPresidentId: string, newPresidentId: string) {
    return this.transaction(async (_repo, tx) => {
      await tx.update(clubMembers)
        .set({ role: "officer" })
        .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, currentPresidentId)));

      const [newPresident] = await tx.update(clubMembers)
        .set({ role: "president" })
        .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, newPresidentId)))
        .returning();

      return newPresident;
    });
  }

  // ── clubApplications ─────────────────────────────────────────────────────
  findActiveApplicationByApplicant(universityId: string, applicantId: string) {
    return db.query.clubApplications.findFirst({
      where: {
        universityId,
        applicantId,
        status: { in: ["pending", "revision_requested"] },
      },
    });
  }

  /** Geriye dönük alias — yalnızca pending arayan eski çağrılar. */
  findPendingApplicationByApplicant(universityId: string, applicantId: string) {
    return this.findActiveApplicationByApplicant(universityId, applicantId);
  }

  /** Başvuranın tek bir başvurusu, onay adımlarıyla (kendi başvurusunu görüntüleme). */
  findApplicationByApplicant(applicantId: string, applicationId: string) {
    return db.query.clubApplications.findFirst({
      where: { id: applicationId, applicantId },
      with: {
        approvals: {
          with: { approver: true },
        },
      },
    });
  }

  /**
   * Başvuruyu ve tenant onay zincirindeki tüm adım satırlarını birlikte oluşturur.
   */
  async createApplication(universityId: string, applicantId: string, data: CreateClubApplicationPayload) {
    const settings = await getTenantSettings(universityId);
    const chain = parseApprovalChain(settings.clubApplicationApprovalChain) ?? DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN;

    return this.transaction(async (_repo, tx) =>
      this.insertApplicationWithApprovals(tx, universityId, applicantId, data, chain)
    );
  }

  /** Transaction içinde başvuru + onay adımları (kuruluş önerisi eşik geçişinde de kullanılır). */
  async insertApplicationWithApprovals(
    tx: Database,
    universityId: string,
    applicantId: string,
    data: CreateClubApplicationPayload,
    chain: ApprovalChainRoleToken[]
  ) {
    const approvalRows = buildApprovalInsertRows(chain);

    const [application] = await tx.insert(clubApplications).values({
      universityId,
      applicantId,
      proposedName: data.proposedName,
      description: data.description,
      status: "pending",
    }).returning();

    await tx.insert(clubApplicationApprovals).values(
      approvalRows.map((row) => ({
        applicationId: application.id,
        step: row.step,
        approverRole: row.approverRole,
        status: row.status,
      }))
    );

    return application;
  }

  /** Bekleyen başvuruyu geri çekme — onay satırları ve olay günlüğü FK ile silinir. */
  deleteApplication(applicationId: string) {
    return this.transaction(async (_repo, tx) => {
      await tx.delete(clubApplicationEvents).where(eq(clubApplicationEvents.applicationId, applicationId));
      await tx.delete(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, applicationId));
      await tx.delete(clubApplications)
        .where(eq(clubApplications.id, applicationId));
    });
  }

  /**
   * Revizyon talebi sonrası başvuru güncelleme — aynı kayıt, zincir kaldığı yerden devam eder.
   */
  async resubmitApplication(
    applicationId: string,
    applicantId: string,
    data: CreateClubApplicationPayload
  ) {
    return this.transaction(async (_repo, tx) => {
      const [application] = await tx
        .select()
        .from(clubApplications)
        .where(
          and(
            eq(clubApplications.id, applicationId),
            eq(clubApplications.applicantId, applicantId)
          )
        )
        .limit(1);
      if (!application || application.status !== "revision_requested") return null;

      const approvals = await tx
        .select()
        .from(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, applicationId))
        .orderBy(asc(clubApplicationApprovals.step));

      const revisionStep = approvals.find((a) => a.status === "revision_requested");
      if (!revisionStep) return null;

      const [updatedApplication] = await tx
        .update(clubApplications)
        .set({
          proposedName: data.proposedName,
          description: data.description,
          status: "pending",
        })
        .where(eq(clubApplications.id, applicationId))
        .returning();

      await tx
        .update(clubApplicationApprovals)
        .set({
          status: "pending",
          approverId: null,
          reviewedAt: null,
          note: null,
        })
        .where(eq(clubApplicationApprovals.id, revisionStep.id));

      await tx.insert(clubApplicationEvents).values({
        applicationId,
        step: revisionStep.step,
        eventType: "resubmitted",
        actorId: applicantId,
        proposedName: data.proposedName,
        description: data.description ?? null,
      });

      return updatedApplication;
    });
  }

  listApplicationEvents(applicationId: string) {
    return db.query.clubApplicationEvents.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
      with: { actor: true },
    });
  }

  // ── clubContactLinks ─────────────────────────────────────────────────────
  findContactLinkByPlatform(clubId: string, platform: CreateContactLinkPayload["platform"]) {
    return contactLinksRepo.findOne({ clubId, platform });
  }

  findContactLink(clubId: string, linkId: string) {
    return contactLinksRepo.findOne({ id: linkId, clubId });
  }

  createContactLink(clubId: string, data: CreateContactLinkPayload) {
    return contactLinksRepo.create({
      clubId,
      platform: data.platform,
      url: data.url,
    });
  }

  async updateContactLink(clubId: string, linkId: string, url: string) {
    const [updated] = await contactLinksRepo.updateWhere({ id: linkId, clubId }, { url });
    return updated;
  }

  deleteContactLink(clubId: string, linkId: string) {
    return contactLinksRepo.deleteWhere({ id: linkId, clubId });
  }

  // ── clubFormationProposals (T1.1) ────────────────────────────────────────

  async expireFormationProposalsPastDeadline(universityId: string) {
    await db
      .update(clubFormationProposals)
      .set({ status: "expired" })
      .where(
        and(
          eq(clubFormationProposals.universityId, universityId),
          eq(clubFormationProposals.status, "collecting_support"),
          lt(clubFormationProposals.expiresAt, new Date())
        )
      );
  }

  findActiveFormationProposalByProposer(universityId: string, proposerId: string) {
    return db.query.clubFormationProposals.findFirst({
      where: {
        universityId,
        proposerId,
        status: "collecting_support",
        expiresAt: { gt: new Date() },
      },
    });
  }

  async createFormationProposal(
    universityId: string,
    proposerId: string,
    data: CreateClubApplicationPayload,
    expiresAt: Date
  ) {
    const [proposal] = await db
      .insert(clubFormationProposals)
      .values({
        universityId,
        proposerId,
        proposedName: data.proposedName,
        description: data.description,
        status: "collecting_support",
        supportCount: 0,
        expiresAt,
      })
      .returning();
    return proposal;
  }

  async listCollectingFormationProposals(universityId: string) {
    await this.expireFormationProposalsPastDeadline(universityId);
    return db.query.clubFormationProposals.findMany({
      where: {
        universityId,
        status: "collecting_support",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      with: { proposer: true },
    });
  }

  findFormationProposalById(proposalId: string) {
    return db.query.clubFormationProposals.findFirst({
      where: { id: proposalId },
    });
  }

  findFormationProposalInUniversity(universityId: string, proposalId: string) {
    return db.query.clubFormationProposals.findFirst({
      where: { id: proposalId, universityId },
      with: { proposer: true, application: true },
    });
  }

  findFormationProposalByProposer(proposerId: string, proposalId: string) {
    return db.query.clubFormationProposals.findFirst({
      where: { id: proposalId, proposerId },
    });
  }

  listFormationSupports(proposalId: string) {
    return db.query.clubFormationSupports.findMany({
      where: { proposalId },
      orderBy: { createdAt: "asc" },
      with: { supporter: true },
    });
  }

  async addFormationSupport(
    universityId: string,
    proposalId: string,
    supporterId: string,
    threshold: number
  ): Promise<
    | { status: "added"; proposal: typeof clubFormationProposals.$inferSelect; application: typeof clubApplications.$inferSelect | null; thresholdReached: boolean }
    | { status: "not_found" }
    | { status: "self_support" }
    | { status: "already_supported" }
  > {
    return await db.transaction(async (tx) => {
      const proposal = await tx.query.clubFormationProposals.findFirst({
        where: {
          id: proposalId,
          universityId,
          status: "collecting_support",
          expiresAt: { gt: new Date() },
        },
      });
      if (!proposal) return { status: "not_found" };
      if (proposal.proposerId === supporterId) return { status: "self_support" };

      const existing = await tx.query.clubFormationSupports.findFirst({
        where: { proposalId, supporterId },
      });
      if (existing) return { status: "already_supported" };

      await tx.insert(clubFormationSupports).values({
        proposalId,
        supporterId,
        universityId,
      });

      const newCount = proposal.supportCount + 1;
      const [updatedProposal] = await tx
        .update(clubFormationProposals)
        .set({ supportCount: newCount })
        .where(eq(clubFormationProposals.id, proposalId))
        .returning();

      if (newCount < threshold) {
        return { status: "added", proposal: updatedProposal, application: null, thresholdReached: false };
      }

      const settings = await getTenantSettings(universityId);
      const chain =
        parseApprovalChain(settings.clubApplicationApprovalChain) ??
        DEFAULT_CLUB_APPLICATION_APPROVAL_CHAIN;

      const application = await this.insertApplicationWithApprovals(
        tx,
        universityId,
        proposal.proposerId,
        { proposedName: proposal.proposedName, description: proposal.description ?? undefined },
        chain
      );

      const [submittedProposal] = await tx
        .update(clubFormationProposals)
        .set({
          status: "submitted",
          applicationId: application.id,
          submittedAt: new Date(),
        })
        .where(eq(clubFormationProposals.id, proposalId))
        .returning();

      return {
        status: "added",
        proposal: submittedProposal,
        application,
        thresholdReached: true,
      };
    });
  }

  async removeFormationSupport(proposalId: string, supporterId: string) {
    return await db.transaction(async (tx) => {
      const proposal = await tx.query.clubFormationProposals.findFirst({
        where: { id: proposalId, status: "collecting_support", expiresAt: { gt: new Date() } },
      });
      if (!proposal) return null;

      const support = await tx.query.clubFormationSupports.findFirst({
        where: { proposalId, supporterId },
      });
      if (!support) return null;

      await tx.delete(clubFormationSupports).where(eq(clubFormationSupports.id, support.id));

      const [updated] = await tx
        .update(clubFormationProposals)
        .set({ supportCount: Math.max(0, proposal.supportCount - 1) })
        .where(eq(clubFormationProposals.id, proposalId))
        .returning();

      return updated;
    });
  }

  async withdrawFormationProposal(proposerId: string, proposalId: string) {
    const proposal = await db.query.clubFormationProposals.findFirst({
      where: { id: proposalId, proposerId, status: "collecting_support" },
    });
    if (!proposal) return null;

    const [updated] = await db
      .update(clubFormationProposals)
      .set({ status: "withdrawn" })
      .where(eq(clubFormationProposals.id, proposalId))
      .returning();
    return updated;
  }

  async listFormationProposalsByUniversity(
    universityId: string,
    status?: "collecting_support" | "submitted" | "withdrawn" | "expired"
  ) {
    await this.expireFormationProposalsPastDeadline(universityId);
    return db.query.clubFormationProposals.findMany({
      where: { universityId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      with: {
        proposer: true,
        application: true,
      },
    });
  }
}

export const clubsRepository = new ClubsRepository();
