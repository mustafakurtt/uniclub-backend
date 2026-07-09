import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import {
  CreateClubApplicationPayload,
  CreateContactLinkPayload,
  UpdateOwnClubPayload,
} from "./clubs.types";

export const clubsRepository = {
  async findApprovedClubsByUniversity(universityId: string, search?: string) {
    return await db.query.clubs.findMany({
      where: {
        universityId,
        status: "approved",
        ...(search ? { name: { ilike: `%${search}%` } } : {}),
      },
      orderBy: { name: "asc" },
    });
  },

  async findClubDetail(universityId: string, clubId: string) {
    return await db.query.clubs.findFirst({
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
  },

  async findClubInUniversity(universityId: string, clubId: string) {
    return await db.query.clubs.findFirst({
      where: { id: clubId, universityId },
    });
  },

  /**
   * Tenant filtresi OLMADAN kulüp getirir. Yalnızca kulübün kimliği zaten
   * doğrulanmış akışlarda (kulüp-içi yetki middleware'inden geçmiş rotalar)
   * bildirim metni gibi yardımcı veriler için kullanılır.
   */
  async findClubById(clubId: string) {
    return await db.query.clubs.findFirst({ where: { id: clubId } });
  },

  /** Kulübün onaylı üyeleri (rol bilgisiyle) — dedike üye listesi endpoint'i için. */
  async findApprovedMembers(clubId: string) {
    return await db.query.clubMembers.findMany({
      where: { clubId, status: "approved" },
      with: { user: true },
      orderBy: { joinedAt: "asc" },
    });
  },

  /** Başkanın kendi kulübünün profilini güncellemesi (status hariç). */
  async updateOwnClub(clubId: string, data: UpdateOwnClubPayload) {
    const [updated] = await db
      .update(schema.clubs)
      .set(data)
      .where(eq(schema.clubs.id, clubId))
      .returning();
    return updated;
  },

  async findPendingApplicationByApplicant(universityId: string, applicantId: string) {
    return await db.query.clubApplications.findFirst({
      where: { universityId, applicantId, status: "pending" },
    });
  },

  /** Başvuranın tek bir başvurusu, onay adımlarıyla (kendi başvurusunu görüntüleme). */
  async findApplicationByApplicant(applicantId: string, applicationId: string) {
    return await db.query.clubApplications.findFirst({
      where: { id: applicationId, applicantId },
      with: {
        approvals: {
          with: { approver: true },
        },
      },
    });
  },

  /**
   * Başvuruyu ve admin'in daha sonra karar vereceği step:1 onay satırını
   * birlikte oluşturur (admin.repository.decideClubApplication bu satırı
   * UPDATE eder, bu yüzden burada var olması şart).
   */
  async createApplication(universityId: string, applicantId: string, data: CreateClubApplicationPayload) {
    return await db.transaction(async (tx) => {
      const [application] = await tx.insert(schema.clubApplications).values({
        universityId,
        applicantId,
        proposedName: data.proposedName,
        description: data.description,
        status: "pending",
      }).returning();

      await tx.insert(schema.clubApplicationApprovals).values({
        applicationId: application.id,
        step: 1,
        approverRole: "advisor",
        status: "pending",
      });

      return application;
    });
  },

  /** Bekleyen başvuruyu geri çekme — onay satırları FK olduğu için önce onlar silinir. */
  async deleteApplication(applicationId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(schema.clubApplicationApprovals)
        .where(eq(schema.clubApplicationApprovals.applicationId, applicationId));
      await tx.delete(schema.clubApplications)
        .where(eq(schema.clubApplications.id, applicationId));
    });
  },

  async findMembership(clubId: string, userId: string) {
    return await db.query.clubMembers.findFirst({
      where: { clubId, userId },
    });
  },

  async addMembership(clubId: string, userId: string, status: "approved" | "pending") {
    const [inserted] = await db.insert(schema.clubMembers).values({
      clubId,
      userId,
      role: "member",
      status,
    }).returning();
    return inserted;
  },

  async removeMembership(clubId: string, userId: string) {
    await db.delete(schema.clubMembers).where(
      and(eq(schema.clubMembers.clubId, clubId), eq(schema.clubMembers.userId, userId))
    );
  },

  async findPendingJoinRequests(clubId: string) {
    return await db.query.clubMembers.findMany({
      where: { clubId, status: "pending" },
      with: { user: true },
    });
  },

  async updateMembershipStatus(clubId: string, userId: string, status: "approved" | "rejected") {
    const [updated] = await db.update(schema.clubMembers)
      .set({ status })
      .where(and(eq(schema.clubMembers.clubId, clubId), eq(schema.clubMembers.userId, userId)))
      .returning();
    return updated;
  },

  async updateMembershipRole(clubId: string, userId: string, role: "member" | "officer" | "president") {
    const [updated] = await db.update(schema.clubMembers)
      .set({ role })
      .where(and(eq(schema.clubMembers.clubId, clubId), eq(schema.clubMembers.userId, userId)))
      .returning();
    return updated;
  },

  /**
   * Başkanlık devri: mevcut başkanı officer'a düşürüp hedef üyeyi başkan yapar,
   * tek transaction'da (yarım kalırsa iki başkanlı/başkansız kulüp olmasın).
   */
  async transferPresidency(clubId: string, currentPresidentId: string, newPresidentId: string) {
    return await db.transaction(async (tx) => {
      await tx.update(schema.clubMembers)
        .set({ role: "officer" })
        .where(and(eq(schema.clubMembers.clubId, clubId), eq(schema.clubMembers.userId, currentPresidentId)));

      const [newPresident] = await tx.update(schema.clubMembers)
        .set({ role: "president" })
        .where(and(eq(schema.clubMembers.clubId, clubId), eq(schema.clubMembers.userId, newPresidentId)))
        .returning();

      return newPresident;
    });
  },

  async findContactLinkByPlatform(clubId: string, platform: CreateContactLinkPayload["platform"]) {
    return await db.query.clubContactLinks.findFirst({
      where: { clubId, platform },
    });
  },

  async findContactLink(clubId: string, linkId: string) {
    return await db.query.clubContactLinks.findFirst({
      where: { id: linkId, clubId },
    });
  },

  async createContactLink(clubId: string, data: CreateContactLinkPayload) {
    const [inserted] = await db.insert(schema.clubContactLinks).values({
      clubId,
      platform: data.platform,
      url: data.url,
    }).returning();
    return inserted;
  },

  async updateContactLink(clubId: string, linkId: string, url: string) {
    const [updated] = await db.update(schema.clubContactLinks)
      .set({ url })
      .where(and(eq(schema.clubContactLinks.id, linkId), eq(schema.clubContactLinks.clubId, clubId)))
      .returning();
    return updated;
  },

  async deleteContactLink(clubId: string, linkId: string) {
    await db.delete(schema.clubContactLinks).where(
      and(eq(schema.clubContactLinks.id, linkId), eq(schema.clubContactLinks.clubId, clubId))
    );
  },
};
