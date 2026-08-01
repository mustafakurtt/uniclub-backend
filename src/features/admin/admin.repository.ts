import { eq, and, lt, desc, sql, getTableColumns, type SQL } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import {
  clubs,
  clubMembers,
  clubAdvisors,
  announcements,
  clubGallery,
  activities,
  activityClubs,
  users,
} from "../../db/schema";
import { BaseRepository } from "../../core/db";
import { slugify } from "../../shared/utils/slug.util";
import {
  deriveApplicationStatus,
  findCurrentApprovalStep,
  assertActorCanDecideCurrentStep,
  isCommitteeMajorityStep,
  type ApplicationApprovalRow,
} from "../clubs/club-application-chain";
import { approvalCommitteesRepository } from "../approval-committees/approval-committees.repository";
import { notFound, badRequest, forbidden } from "../../shared/utils/errors";
import {
  User,
  Club,
  ClubApplication,
  DecideClubApplicationResult,
  UpdateClubPayload,
} from "./admin.types";

const MAX_SLUG_ATTEMPTS = 5;

type ApplicationStepDecision = "approved" | "rejected" | "revision_requested";
type ApplicationEventType = ApplicationStepDecision | "resubmitted";

type ApplicationWithApprovals = {
  id: string;
  universityId: string;
  applicantId: string;
  proposedName: string;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "revision_requested";
  approvals: Array<{
    id: string;
    step: number;
    approverRole: string | null;
    stepKind: "role_sequential" | "committee_majority";
    committeeId: string | null;
    status: ApplicationApprovalRow["status"];
  }>;
};

function mapApprovalRows(approvals: ApplicationWithApprovals["approvals"]): ApplicationApprovalRow[] {
  return approvals.map((a) => ({
    step: a.step,
    approverRole: a.approverRole,
    stepKind: a.stepKind,
    committeeId: a.committeeId,
    status: a.status,
  }));
}

async function insertApplicationEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  data: {
    applicationId: string;
    step: number;
    eventType: ApplicationEventType;
    actorId: string;
    note?: string | null;
    proposedName?: string | null;
    description?: string | null;
  }
) {
  await tx.insert(schema.clubApplicationEvents).values({
    applicationId: data.applicationId,
    step: data.step,
    eventType: data.eventType,
    actorId: data.actorId,
    note: data.note ?? null,
    proposedName: data.proposedName ?? null,
    description: data.description ?? null,
  });
}

async function finalizeApplicationStepInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  universityId: string,
  applicationId: string,
  application: ApplicationWithApprovals,
  approvalRowId: string,
  decision: ApplicationStepDecision,
  actorUserId: string,
  note: string | null
): Promise<DecideClubApplicationResult> {
  const approvalRow = application.approvals.find((a) => a.id === approvalRowId);
  if (!approvalRow) {
    throw badRequest("admin.applicationAlreadyDecided");
  }

  await tx
    .update(schema.clubApplicationApprovals)
    .set({
      status: decision,
      approverId: actorUserId,
      reviewedAt: new Date(),
      note,
    })
    .where(eq(schema.clubApplicationApprovals.id, approvalRowId));

  await insertApplicationEvent(tx, {
    applicationId,
    step: approvalRow.step,
    eventType: decision,
    actorId: actorUserId,
    note,
  });

  const approvalsAfter = application.approvals.map((a) =>
    a.id === approvalRowId
      ? { ...a, status: decision }
      : a
  );

  const derivedStatus = deriveApplicationStatus(mapApprovalRows(approvalsAfter));

  const [updatedApplication] = await tx
    .update(schema.clubApplications)
    .set({
      status: derivedStatus,
      ...(derivedStatus === "rejected"
        ? { rejectedAt: new Date(), rejectApproverId: actorUserId }
        : {}),
    })
    .where(eq(schema.clubApplications.id, applicationId))
    .returning();

  if (derivedStatus !== "approved") {
    return { application: updatedApplication, club: null };
  }

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
    throw badRequest("admin.slugGenerationFailed");
  }

  await tx.insert(schema.clubMembers).values({
    clubId: club.id,
    userId: application.applicantId,
    universityId: club.universityId,
    role: "president",
    status: "approved",
  });

  return { application: updatedApplication, club };
}

async function applyApplicationStepDecision(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  universityId: string,
  applicationId: string,
  actorUserId: string,
  decision: ApplicationStepDecision,
  note: string | null
): Promise<DecideClubApplicationResult> {
  const application = await tx.query.clubApplications.findFirst({
    where: { id: applicationId, universityId },
    with: { approvals: { orderBy: { step: "asc" } } },
  });

  if (!application) {
    throw notFound("admin.applicationNotFound");
  }

  if (application.status !== "pending") {
    throw badRequest("admin.applicationAlreadyDecided");
  }

  const approvalRows = mapApprovalRows(application.approvals);
  const currentStep = findCurrentApprovalStep(approvalRows);
  if (!currentStep) {
    throw badRequest("admin.applicationAlreadyDecided");
  }

  const approvalRow = application.approvals.find((a) => a.step === currentStep.step);
  if (!approvalRow) {
    throw badRequest("admin.applicationAlreadyDecided");
  }

  if (isCommitteeMajorityStep(currentStep)) {
    if (decision === "revision_requested") {
      if (!approvalRow.committeeId) {
        throw badRequest("admin.applicationAlreadyDecided");
      }
      const isMember = await approvalCommitteesRepository.isActiveMember(
        approvalRow.committeeId,
        universityId,
        actorUserId
      );
      if (!isMember) {
        throw forbidden("admin.approvalStepForbidden");
      }
    } else {
      throw badRequest("admin.committeeStepUseVoteEndpoint");
    }
  } else {
    await assertActorCanDecideCurrentStep(actorUserId, approvalRows, currentStep);
  }

  return await finalizeApplicationStepInTransaction(
    tx,
    universityId,
    applicationId,
    application as ApplicationWithApprovals,
    approvalRow.id,
    decision,
    actorUserId,
    note
  );
}

/**
 * admin cross-tenant moderasyon aggregate'i tek bir sahip tabloya oturmaz. Ama
 * `id` taşıyan tablolara tenant-kapsamlı okuma/yazma (`{ id, universityId }`)
 * tekrar eden bir boilerplate'tir — bunları core composite-where helper'larıyla
 * sadeleştirmek için tablo başına hafif BaseRepository örnekleri tutulur.
 * (clubMembers/clubAdvisors BİLEŞİK anahtarlı olduğu için kapsam dışı → ham Drizzle.)
 */
const usersRepo = new BaseRepository(db, schema.users);
const clubsRepo = new BaseRepository(db, schema.clubs);
const applicationsRepo = new BaseRepository(db, schema.clubApplications);

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
   * filtreleri; her satırda global rolleri (`roles`) da döner (bkz. docs/design/05 #4).
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
    return await usersRepo.findOne({ id: userId, universityId });
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
    const [updated] = await usersRepo.updateWhere({ id: userId, universityId }, { departmentId });
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
      with: {
        applicant: true,
        approvals: { orderBy: { step: "asc" } },
      },
    });
  },

  async findClubApplicationInUniversity(universityId: string, applicationId: string) {
    return await applicationsRepo.findOne({ id: applicationId, universityId });
  },

  async findClubApplicationDetail(universityId: string, applicationId: string) {
    return await db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
      with: {
        applicant: true,
        approvals: {
          orderBy: { step: "asc" },
          with: { approver: true },
        },
        appeal: { with: { reviewer: true } },
      },
    });
  },

  async countClubApplicationRevisionRequests(applicationId: string): Promise<number> {
    const events = await db.query.clubApplicationEvents.findMany({
      where: { applicationId },
      columns: { eventType: true },
    });
    return events.filter((e) => e.eventType === "revision_requested").length;
  },

  /**
   * Başvuruyu onaylar/reddeder — yalnızca sıradaki kademe; özet durum adımlardan türetilir.
   * Onay tamamlandığında gerçek `clubs` satırı oluşturulur.
   */
  async decideClubApplication(
    universityId: string,
    applicationId: string,
    actorUserId: string,
    decision: "approved" | "rejected",
    note: string | null
  ): Promise<DecideClubApplicationResult> {
    return await db.transaction(async (tx) =>
      applyApplicationStepDecision(tx, universityId, applicationId, actorUserId, decision, note)
    );
  },

  /** Revizyon talebi — gerekçe zorunlu; önceki kademe onayları korunur. */
  async requestClubApplicationRevision(
    universityId: string,
    applicationId: string,
    actorUserId: string,
    note: string
  ): Promise<DecideClubApplicationResult> {
    return await db.transaction(async (tx) =>
      applyApplicationStepDecision(tx, universityId, applicationId, actorUserId, "revision_requested", note)
    );
  },

  finalizeApplicationStepInTransaction(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    universityId: string,
    applicationId: string,
    application: ApplicationWithApprovals,
    approvalRowId: string,
    decision: ApplicationStepDecision,
    actorUserId: string,
    note: string | null
  ) {
    return finalizeApplicationStepInTransaction(
      tx,
      universityId,
      applicationId,
      application,
      approvalRowId,
      decision,
      actorUserId,
      note
    );
  },

  findClubApplicationEvents(applicationId: string) {
    return db.query.clubApplicationEvents.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
      with: { actor: true },
    });
  },

  async findClubsByUniversity(universityId: string, status?: Club["status"]) {
    return await db.query.clubs.findMany({
      where: { universityId, ...(status ? { status } : {}) },
    });
  },

  async findClubInUniversity(universityId: string, clubId: string) {
    return await clubsRepo.findOne({ id: clubId, universityId });
  },

  /** Kulüp + özet sayaçlar — tek sorgu, N+1 yok. */
  async findClubDetailWithCounts(universityId: string, clubId: string) {
    const [row] = await db
      .select({
        club: getTableColumns(clubs),
        memberCount: sql<number>`(
          select cast(count(*) as int) from ${clubMembers}
          where ${clubMembers.clubId} = ${clubId} and ${clubMembers.status} = 'approved'
        )`,
        pendingJoinRequests: sql<number>`(
          select cast(count(*) as int) from ${clubMembers}
          where ${clubMembers.clubId} = ${clubId} and ${clubMembers.status} = 'pending'
        )`,
        advisorCount: sql<number>`(
          select cast(count(*) as int) from ${clubAdvisors}
          where ${clubAdvisors.clubId} = ${clubId}
            and ${clubAdvisors.leftAt} is null
        )`,
        upcomingActivities: sql<number>`(
          select cast(count(distinct a.id) as int)
          from activities a
          inner join activity_clubs ac on ac.activity_id = a.id
          where ac.club_id = ${clubId}
            and ac.status = 'accepted'
            and a.status = 'published'
            and a.starts_at >= now()
        )`,
      })
      .from(clubs)
      .where(and(eq(clubs.id, clubId), eq(clubs.universityId, universityId)))
      .limit(1);
    if (!row) return null;
    const { club, memberCount, pendingJoinRequests, advisorCount, upcomingActivities } = row;
    return {
      club,
      memberCount,
      pendingJoinRequests,
      advisorCount,
      upcomingActivities,
    };
  },

  async listClubAnnouncementsForAdmin(clubId: string, limit: number, cursor?: Date) {
    const filters: SQL[] = [eq(announcements.clubId, clubId)];
    if (cursor) filters.push(lt(announcements.createdAt, cursor));
    const rows = await db
      .select({
        announcement: getTableColumns(announcements),
        author: getTableColumns(users),
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorId, users.id))
      .where(and(...filters))
      .orderBy(desc(announcements.createdAt))
      .limit(limit + 1);
    return rows.map((row) => ({ ...row.announcement, author: row.author }));
  },

  async listClubGalleryForAdmin(clubId: string, limit: number, cursor?: Date) {
    const filters: SQL[] = [eq(clubGallery.clubId, clubId)];
    if (cursor) filters.push(lt(clubGallery.createdAt, cursor));
    const rows = await db
      .select({
        image: getTableColumns(clubGallery),
        uploader: getTableColumns(users),
      })
      .from(clubGallery)
      .innerJoin(users, eq(clubGallery.uploadedBy, users.id))
      .where(and(...filters))
      .orderBy(desc(clubGallery.createdAt))
      .limit(limit + 1);
    return rows.map((row) => ({ ...row.image, uploader: row.uploader }));
  },

  listClubActivitiesForAdmin(clubId: string, limit: number, cursor?: Date) {
    const filters: SQL[] = [
      eq(activityClubs.clubId, clubId),
      eq(activityClubs.status, "accepted"),
    ];
    if (cursor) filters.push(lt(activities.startsAt, cursor));
    return db
      .select(getTableColumns(activities))
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .where(and(...filters))
      .orderBy(desc(activities.startsAt))
      .limit(limit + 1);
  },

  async updateClubStatus(universityId: string, clubId: string, status: Club["status"]): Promise<Club | undefined> {
    const [updated] = await clubsRepo.updateWhere({ id: clubId, universityId }, { status });
    return updated;
  },

  async updateClub(universityId: string, clubId: string, data: UpdateClubPayload): Promise<Club | undefined> {
    const [updated] = await clubsRepo.updateWhere({ id: clubId, universityId }, data);
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
      where: { clubId, leftAt: { isNull: true } },
      with: { user: true },
    });
  },

  async findAdvisor(clubId: string, userId: string) {
    return await db.query.clubAdvisors.findFirst({
      where: { clubId, userId, leftAt: { isNull: true } },
    });
  },

  // universityId zorunlu: satır hem kulübe hem danışmana BİLEŞİK FK ile bağlı —
  // "başka okulun hocasını danışman yapma" artık DB'de de imkânsız
  // (servis katmanındaki kontrolün ikizi, bkz. adminService.addAdvisor).
  async addAdvisor(clubId: string, userId: string, universityId: string) {
    const [inserted] = await db
      .insert(schema.clubAdvisors)
      .values({ clubId, userId, universityId })
      .returning();
    return inserted;
  },

  async removeAdvisor(clubId: string, userId: string) {
    await db.delete(schema.clubAdvisors).where(
      and(eq(schema.clubAdvisors.clubId, clubId), eq(schema.clubAdvisors.userId, userId))
    );
  },

  // ═══════════════════════════════════════════════
  // TENANT MODERASYON (bkz. docs/design/06 §A6)
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
