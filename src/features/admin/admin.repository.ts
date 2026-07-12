import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { slugify } from "../../shared/utils/slug.util";
import {
  User,
  Club,
  ClubApplication,
  DecideClubApplicationResult,
  UpdateClubPayload,
} from "./admin.types";

const MAX_SLUG_ATTEMPTS = 5;

export const adminRepository = {
  /** Tüm üniversiteler — yalnızca platform seviyesi aktörler için (bkz. listAccessibleUniversities). */
  async findAllUniversities() {
    return await db.query.universities.findMany();
  },

  async findUniversityById(universityId: string) {
    return await db.query.universities.findFirst({ where: { id: universityId } });
  },

  /**
   * Üniversitedeki kullanıcıları listeler. İsteğe bağlı `status` ve `roleName`
   * filtreleri; her satırda global rolleri (`roles`) da döner (bkz. docs/yonetim/05 #4).
   */
  async findUsersByUniversity(universityId: string, status?: User["status"], roleName?: string) {
    let idFilter: { in: string[] } | undefined;
    if (roleName) {
      const role = await db.query.roles.findFirst({
        where: { name: roleName },
        columns: { id: true },
      });
      if (!role) return [];
      const roleUsers = await db.query.userRoles.findMany({
        where: { roleId: role.id },
        columns: { userId: true },
      });
      const ids = roleUsers.map((r) => r.userId);
      if (ids.length === 0) return [];
      idFilter = { in: ids };
    }

    return await db.query.users.findMany({
      where: {
        universityId,
        ...(status ? { status } : {}),
        ...(idFilter ? { id: idFilter } : {}),
      },
      with: {
        // `rank` dahil edilir: frontend, hedef kullanıcının en yüksek rütbesini
        // kendi `maxRank`'iyle kıyaslayıp aksiyonları önceden disable edebilsin.
        roles: { columns: { id: true, name: true, description: true, universityId: true, rank: true } },
      },
    });
  },

  async findUserInUniversity(universityId: string, userId: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: { id: userId, universityId },
    });
  },

  /**
   * Kullanıcıyı; global rolleri, kulüp üyelikleri (kulüp bilgisiyle) ve kişisel
   * yetki override'larıyla birlikte getirir (yönetici detay ekranı için).
   */
  async findUserInUniversityDetailed(universityId: string, userId: string) {
    return await db.query.users.findFirst({
      where: { id: userId, universityId },
      with: {
        roles: { columns: { id: true, name: true, description: true, universityId: true, rank: true } },
        clubMemberships: { with: { club: true } },
        userPermissions: { with: { permission: true } },
      },
    });
  },

  async updateUserDepartment(universityId: string, userId: string, departmentId: string | null): Promise<User | undefined> {
    const [updated] = await db
      .update(schema.users)
      .set({ departmentId })
      .where(and(eq(schema.users.id, userId), eq(schema.users.universityId, universityId)))
      .returning();
    return updated;
  },

  /**
   * departments.universityId denormalize edilmediği için (bkz. schema.ts),
   * bir bölümün gerçekten hedeflenen üniversiteye ait olduğunu doğrulamak
   * faculty zincirinden geçmeyi gerektirir.
   */
  async findDepartmentWithUniversity(departmentId: string) {
    return await db.query.departments.findFirst({
      where: { id: departmentId },
      with: { faculty: true },
    });
  },

  async findClubApplicationsByUniversity(universityId: string, status?: ClubApplication["status"]) {
    return await db.query.clubApplications.findMany({
      where: { universityId, ...(status ? { status } : {}) },
      with: { applicant: true },
    });
  },

  async findClubApplicationInUniversity(universityId: string, applicationId: string) {
    return await db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
    });
  },

  /**
   * Başvuruyu onaylar/reddeder. Onay durumunda gerçek bir `clubs` satırı
   * ve başvuranı başkan yapan bir `clubMembers` satırı oluşturur.
   */
  async decideClubApplication(
    universityId: string,
    applicationId: string,
    actorUserId: string,
    decision: "approved" | "rejected"
  ): Promise<DecideClubApplicationResult> {
    return await db.transaction(async (tx) => {
      const application = await tx.query.clubApplications.findFirst({
        where: { id: applicationId, universityId },
      });

      if (!application) {
        throw new Error("Başvuru bulunamadı.");
      }

      if (application.status !== "pending") {
        throw new Error("Bu başvuru zaten değerlendirilmiş.");
      }

      const [updatedApplication] = await tx
        .update(schema.clubApplications)
        .set({ status: decision })
        .where(eq(schema.clubApplications.id, applicationId))
        .returning();

      await tx
        .update(schema.clubApplicationApprovals)
        .set({ status: decision, approverId: actorUserId, reviewedAt: new Date() })
        .where(and(
          eq(schema.clubApplicationApprovals.applicationId, applicationId),
          eq(schema.clubApplicationApprovals.step, 1)
        ));

      if (decision === "rejected") {
        return { application: updatedApplication, club: null };
      }

      // Onay: gerçek kulübü oluştur (slug, üniversite içinde benzersiz olmalı)
      const baseSlug = slugify(application.proposedName);
      let club: Club | undefined;

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
        const existing = await tx.query.clubs.findFirst({
          where: { universityId, slug: candidateSlug },
        });
        if (existing) continue;

        [club] = await tx.insert(schema.clubs).values({
          universityId,
          name: application.proposedName,
          slug: candidateSlug,
          description: application.description,
          status: "approved",
          createdBy: application.applicantId,
        }).returning();
        break;
      }

      if (!club) {
        throw new Error("Kulüp için uygun bir slug bulunamadı, lütfen tekrar deneyin.");
      }

      await tx.insert(schema.clubMembers).values({
        clubId: club.id,
        userId: application.applicantId,
        role: "president",
        status: "approved",
      });

      return { application: updatedApplication, club };
    });
  },

  async findClubsByUniversity(universityId: string, status?: Club["status"]) {
    return await db.query.clubs.findMany({
      where: { universityId, ...(status ? { status } : {}) },
    });
  },

  async findClubInUniversity(universityId: string, clubId: string) {
    return await db.query.clubs.findFirst({
      where: { id: clubId, universityId },
    });
  },

  async updateClubStatus(universityId: string, clubId: string, status: Club["status"]): Promise<Club | undefined> {
    const [updated] = await db
      .update(schema.clubs)
      .set({ status })
      .where(and(eq(schema.clubs.id, clubId), eq(schema.clubs.universityId, universityId)))
      .returning();
    return updated;
  },

  async updateClub(universityId: string, clubId: string, data: UpdateClubPayload): Promise<Club | undefined> {
    const [updated] = await db
      .update(schema.clubs)
      .set(data)
      .where(and(eq(schema.clubs.id, clubId), eq(schema.clubs.universityId, universityId)))
      .returning();
    return updated;
  },

  /**
   * Kulübü ve ona bağlı tüm içeriği tek transaction'da siler. Silme sırası FK
   * bağımlılıklarına göredir: önce yaprak kayıtlar (duyuru/galeri/link/üyelik/
   * danışmanlık), en son kulübün kendisi. Başvurular (clubApplications) kulübe FK
   * ile bağlı DEĞİLDİR (ayrı yaşam döngüsü), o yüzden dokunulmaz.
   */
  async deleteClub(universityId: string, clubId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(schema.announcements).where(eq(schema.announcements.clubId, clubId));
      await tx.delete(schema.clubGallery).where(eq(schema.clubGallery.clubId, clubId));
      await tx.delete(schema.clubContactLinks).where(eq(schema.clubContactLinks.clubId, clubId));
      await tx.delete(schema.clubMembers).where(eq(schema.clubMembers.clubId, clubId));
      await tx.delete(schema.clubAdvisors).where(eq(schema.clubAdvisors.clubId, clubId));
      await tx.delete(schema.clubs).where(
        and(eq(schema.clubs.id, clubId), eq(schema.clubs.universityId, universityId))
      );
    });
  },

  /** Kullanıcının belirli bir global role (örn. "advisor") sahip olup olmadığı. */
  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: { id: userId },
      with: { roles: { where: { name: roleName }, columns: { id: true } } },
    });
    return !!user && user.roles.length > 0;
  },

  async findAdvisorsByClub(clubId: string) {
    return await db.query.clubAdvisors.findMany({
      where: { clubId },
      with: { user: true },
    });
  },

  async findAdvisor(clubId: string, userId: string) {
    return await db.query.clubAdvisors.findFirst({
      where: { clubId, userId },
    });
  },

  async addAdvisor(clubId: string, userId: string) {
    const [inserted] = await db.insert(schema.clubAdvisors).values({ clubId, userId }).returning();
    return inserted;
  },

  async removeAdvisor(clubId: string, userId: string) {
    await db.delete(schema.clubAdvisors).where(
      and(eq(schema.clubAdvisors.clubId, clubId), eq(schema.clubAdvisors.userId, userId))
    );
  },

  // ═══════════════════════════════════════════════
  // TENANT MODERASYON (bkz. docs/yonetim/06 §A6)
  // ═══════════════════════════════════════════════
  async findMembersByClub(clubId: string) {
    return await db.query.clubMembers.findMany({
      where: { clubId },
      with: { user: true },
    });
  },

  async findClubMember(clubId: string, userId: string) {
    return await db.query.clubMembers.findFirst({
      where: { clubId, userId },
    });
  },

  async removeClubMember(clubId: string, userId: string) {
    await db.delete(schema.clubMembers).where(
      and(eq(schema.clubMembers.clubId, clubId), eq(schema.clubMembers.userId, userId))
    );
  },

  async findAnnouncementInClub(clubId: string, announcementId: string) {
    return await db.query.announcements.findFirst({
      where: { id: announcementId, clubId },
    });
  },

  async deleteAnnouncement(announcementId: string) {
    await db.delete(schema.announcements).where(eq(schema.announcements.id, announcementId));
  },

  async findGalleryImageInClub(clubId: string, imageId: string) {
    return await db.query.clubGallery.findFirst({
      where: { id: imageId, clubId },
    });
  },

  async deleteGalleryImage(imageId: string) {
    await db.delete(schema.clubGallery).where(eq(schema.clubGallery.id, imageId));
  },
};
