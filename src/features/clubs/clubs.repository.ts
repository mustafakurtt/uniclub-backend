import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import {
  clubs,
  clubMembers,
  clubContactLinks,
  clubApplications,
  clubApplicationApprovals,
} from "../../db/schema";
import { BaseRepository } from "../../core/db";
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
  /** Kulübün onaylı üyeleri (rol bilgisiyle) — dedike üye listesi endpoint'i için. */
  findApprovedMembers(clubId: string) {
    return db.query.clubMembers.findMany({
      where: { clubId, status: "approved" },
      with: { user: true },
      orderBy: { joinedAt: "asc" },
    });
  }

  findMembership(clubId: string, userId: string) {
    return db.query.clubMembers.findFirst({
      where: { clubId, userId },
    });
  }

  async addMembership(clubId: string, userId: string, status: "approved" | "pending") {
    const [inserted] = await db.insert(clubMembers).values({
      clubId,
      userId,
      role: "member",
      status,
    }).returning();
    return inserted;
  }

  async removeMembership(clubId: string, userId: string) {
    await db.delete(clubMembers).where(
      and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId))
    );
  }

  findPendingJoinRequests(clubId: string) {
    return db.query.clubMembers.findMany({
      where: { clubId, status: "pending" },
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
  findPendingApplicationByApplicant(universityId: string, applicantId: string) {
    return applicationsRepo.findOne({ universityId, applicantId, status: "pending" });
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
   * Başvuruyu ve admin'in daha sonra karar vereceği step:1 onay satırını
   * birlikte oluşturur (admin.repository.decideClubApplication bu satırı
   * UPDATE eder, bu yüzden burada var olması şart).
   */
  createApplication(universityId: string, applicantId: string, data: CreateClubApplicationPayload) {
    return this.transaction(async (_repo, tx) => {
      const [application] = await tx.insert(clubApplications).values({
        universityId,
        applicantId,
        proposedName: data.proposedName,
        description: data.description,
        status: "pending",
      }).returning();

      await tx.insert(clubApplicationApprovals).values({
        applicationId: application.id,
        step: 1,
        approverRole: "advisor",
        status: "pending",
      });

      return application;
    });
  }

  /** Bekleyen başvuruyu geri çekme — onay satırları FK olduğu için önce onlar silinir. */
  deleteApplication(applicationId: string) {
    return this.transaction(async (_repo, tx) => {
      await tx.delete(clubApplicationApprovals)
        .where(eq(clubApplicationApprovals.applicationId, applicationId));
      await tx.delete(clubApplications)
        .where(eq(clubApplications.id, applicationId));
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
}

export const clubsRepository = new ClubsRepository();
