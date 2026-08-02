import { adminRepository } from "./admin.repository";
import { clubsRepository } from "../clubs/clubs.repository";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { UpdateClubStatusDTO, UpdateClubDTO, UpdateUserDepartmentDTO } from "./admin.schema";
import { DecideClubApplicationResult, User } from "./admin.types";
import { toSafeUser } from "../../shared/utils/user.util";
import { resolveAuthz } from "../../shared/rbac/rbac.cache";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { notFound, badRequest } from "../../shared/utils/errors";
// Çapraz-feature: admin, kulüp/duyuru/galeri kaynaklarını da yazar. Hangi cache
// anahtarlarının düştüğü bilgisi ilgili feature'ın kendi keyspace'inde durur;
// admin yalnızca olayı emit eder.
import { clubEffects } from "../clubs/clubs.cache";
import { clubApplicationReviewService } from "../clubs/club-application-review.service";
import { membershipHistoryService } from "../membership-history/membership-history.service";
import { clubAdvisorsService } from "../club-advisors/club-advisors.service";
import { auditService } from "../audit/audit.service";
import { clubApplicationCommitteeService } from "../clubs/club-application-committee.service";
import { committeeApplicationAccessRepository } from "../approval-committees/committee-application-access.repository";
import { announcementEffects } from "../announcements/announcements.cache";
import { galleryEffects } from "../gallery/gallery.cache";

/**
 * Başvuru sahibine kararı bildirir. `notifySafe` kullanılır: bildirim
 * gönderilemedi diye onay/red işlemi geri alınmaz — karar zaten DB'ye yazılmıştır.
 */
async function notifyApplicationDecision(
  result: DecideClubApplicationResult,
  decision: "approved" | "rejected"
) {
  const { application, club } = result;
  const approved = decision === "approved";

  await notificationsService.notifySafe(application.applicantId, {
    type: NotificationType.CLUB_APPLICATION_DECIDED,
    title: approved ? "Kulüp başvurunuz onaylandı" : "Kulüp başvurunuz reddedildi",
    body: approved
      ? `'${application.proposedName}' kulübü kuruldu ve başkanı oldunuz.`
      : `'${application.proposedName}' başvurunuz olumsuz sonuçlandı.`,
    data: { applicationId: application.id, status: decision, clubId: club?.id ?? null },
  });
}

async function notifyApplicationDecisionIfFinal(result: DecideClubApplicationResult) {
  const { application } = result;
  if (application.status === "pending" || application.status === "revision_requested") return;
  const decision = application.status as "approved" | "rejected";
  await notifyApplicationDecision(result, decision);
}

async function notifyApplicationRevisionRequested(
  result: DecideClubApplicationResult,
  note: string,
  step: number
) {
  const { application } = result;
  await notificationsService.notifySafe(application.applicantId, {
    type: NotificationType.CLUB_APPLICATION_REVISION_REQUESTED,
    title: "Kulüp başvurunuzda düzeltme talep edildi",
    body: `'${application.proposedName}' başvurunuz için düzeltme istendi: ${note}`,
    data: { applicationId: application.id, step },
  });
}

function parseKeysetCursor(cursor?: string): Date | undefined {
  if (!cursor) return undefined;
  const cursorDate = new Date(cursor);
  if (Number.isNaN(cursorDate.getTime())) {
    throw badRequest("validation.failed");
  }
  return cursorDate;
}

function paginateByCreatedAt<T extends { createdAt: Date }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;
  return { items, nextCursor };
}

function paginateByStartsAt<T extends { startsAt: Date }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].startsAt.toISOString() : null;
  return { items, nextCursor };
}

export const adminService = {
  /**
   * Aktörün YÖNETİM bağlamında görebileceği üniversiteler.
   *   - Platform seviyesi rol (super_admin / platform_support) → hepsi.
   *   - Tenant kullanıcısı → yalnızca kendi üniversitesi.
   *   - Platform hesabı ama bypass rolü yok → hiçbiri.
   *
   * Yönetim paneli, public `GET /api/universities` (kayıt formu için global) yerine
   * bunu kullanmalıdır; aksi halde bir university_admin akademik yapı ekranında
   * başka üniversiteleri de görür.
   */
  async listAccessibleUniversities(actor: { universityId: string | null; isPlatformScoped: boolean }) {
    if (actor.isPlatformScoped) {
      return await adminRepository.findAllUniversities();
    }
    if (!actor.universityId) {
      return [];
    }
    const university = await adminRepository.findUniversityById(actor.universityId);
    return university ? [university] : [];
  },

  async listUsers(universityId: string, status?: "pending" | "active" | "suspended", roleName?: string) {
    const users = await adminRepository.findUsersByUniversity(universityId, status, roleName);
    return users.map(toSafeUser);
  },

  /**
   * Kullanıcıyı; rolleri, kulüp üyelikleri ve effective (etkin) yetkileriyle
   * birlikte döner. Kişisel yetki override'ları `permissionOverrides` altında.
   */
  async getUser(universityId: string, userId: string) {
    const user = await adminRepository.findUserInUniversityDetailed(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }
    const { roles, clubMemberships, userPermissions, ...rest } = user;
    const effective = await resolveAuthz(userId);
    return {
      ...toSafeUser(rest as unknown as User),
      roles,
      clubMemberships,
      permissionOverrides: userPermissions,
      effectivePermissions: effective.permissions,
    };
  },

  /** Kullanıcının effective (roller + kişisel override uygulanmış) yetkileri. */
  async getUserEffectivePermissions(universityId: string, userId: string) {
    const user = await adminRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }
    return await resolveAuthz(userId);
  },

  /**
   * Hedef bölümün gerçekten bu üniversiteye ait olduğunu doğrular
   * (departments.universityId denormalize edilmediği için faculty zincirinden kontrol edilir).
   */
  async updateUserDepartment(universityId: string, userId: string, data: UpdateUserDepartmentDTO) {
    const user = await adminRepository.findUserInUniversity(universityId, userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }

    if (data.departmentId !== null) {
      const department = await adminRepository.findDepartmentWithUniversity(data.departmentId);
      if (!department || !department.faculty || department.faculty.universityId !== universityId) {
        throw badRequest("admin.departmentNotInUniversity");
      }
    }

    const updated = await adminRepository.updateUserDepartment(universityId, userId, data.departmentId);
    return toSafeUser(updated as User);
  },

  async listClubApplications(
    universityId: string,
    status?: "pending" | "approved" | "rejected" | "revision_requested"
  ) {
    const applications = await adminRepository.findClubApplicationsByUniversity(universityId, status);
    return applications.map((application) => ({
      ...application,
      applicant: application.applicant ? toSafeUser(application.applicant) : null,
    }));
  },

  async listMyCommitteePendingApplications(universityId: string, actorUserId: string) {
    const rows = await committeeApplicationAccessRepository.listPendingApplicationsAwaitingUserVote(
      universityId,
      actorUserId
    );
    return rows.map((row) => ({
      id: row.application.id,
      proposedName: row.application.proposedName,
      description: row.application.description,
      status: row.application.status,
      createdAt: row.application.createdAt,
      applicant: row.application.applicant ? toSafeUser(row.application.applicant) : null,
      committeeStep: row.currentStep,
      committeeId: row.committeeId,
      committeeName: row.committeeName,
    }));
  },

  async getClubApplication(universityId: string, applicationId: string, actorUserId: string) {
    const application = await adminRepository.findClubApplicationDetail(universityId, applicationId);
    if (!application) {
      throw notFound("admin.applicationNotFound");
    }
    const revisionRequestCount = await adminRepository.countClubApplicationRevisionRequests(applicationId);
    const { applicant, approvals, appeal, ...rest } = application;
    const review = await clubApplicationReviewService.buildReviewEnrichment(
      universityId,
      applicationId,
      { ...application, approvals },
      appeal
    );
    const mappedApprovals = approvals.map((approval) => ({
      step: approval.step,
      stepKind: approval.stepKind,
      committeeId: approval.committeeId,
      approverRole: approval.approverRole,
      status: approval.status,
      note: approval.status === "rejected" || approval.status === "revision_requested"
        ? approval.note
        : approval.note,
      reviewedAt: approval.reviewedAt,
      approver: approval.approver ? toSafeUser(approval.approver) : null,
    }));
    const approvalsWithTally = await clubApplicationCommitteeService.enrichApprovalsWithCommitteeTally(
      universityId,
      applicationId,
      mappedApprovals,
      actorUserId,
      false
    );
    return {
      ...rest,
      applicant: applicant ? toSafeUser(applicant) : null,
      approvals: approvalsWithTally,
      revisionRequestCount,
      ...review,
    };
  },

  async listFormationProposals(
    universityId: string,
    status?: "collecting_support" | "submitted" | "withdrawn" | "expired"
  ) {
    const settings = await getTenantSettings(universityId);
    const proposals = await clubsRepository.listFormationProposalsByUniversity(universityId, status);
    return proposals.map((proposal) => ({
      ...proposal,
      supportThreshold: settings.clubFormationSupportThreshold,
      proposer: proposal.proposer ? toSafeUser(proposal.proposer) : null,
    }));
  },

  async getFormationProposal(universityId: string, proposalId: string) {
    const proposal = await clubsRepository.findFormationProposalInUniversity(universityId, proposalId);
    if (!proposal) {
      throw notFound("admin.formationProposalNotFound");
    }
    const settings = await getTenantSettings(universityId);
    const supports = await clubsRepository.listFormationSupports(proposalId);
    return {
      ...proposal,
      supportThreshold: settings.clubFormationSupportThreshold,
      proposer: proposal.proposer ? toSafeUser(proposal.proposer) : null,
      supporters: supports
        .filter((s) => s.supporter)
        .map((s) => ({
          supportedAt: s.createdAt,
          user: toSafeUser(s.supporter!),
        })),
    };
  },

  /**
   * Onaylama akışında repository, başvuruyu gerçek bir kulübe dönüştürür
   * (bkz. admin.repository.decideClubApplication).
   */
  async approveClubApplication(universityId: string, applicationId: string, actorUserId: string, note?: string) {
    await clubApplicationReviewService.assertChecklistAllowsApproval(universityId, applicationId);
    const result = await adminRepository.decideClubApplication(universityId, applicationId, actorUserId, "approved", note ?? null);
    await notifyApplicationDecisionIfFinal(result);
    if (result.application.status === "pending") {
      await clubApplicationCommitteeService.notifyIfCurrentStepIsCommittee(universityId, applicationId);
    }
    if (result.application.status === "approved" && result.club) {
      await membershipHistoryService.recordJoined(
        result.club.id,
        result.application.applicantId,
        universityId,
        "president",
        actorUserId
      );
      await clubEffects.clubApproved.emit(universityId);
    }
    return result;
  },

  /**
   * Ret GEREKÇESİZ yapılamaz: öğrenci neyi düzelteceğini bilmeden yeniden
   * başvuramaz ve gerekçesiz bir ret denetlenebilir bir karar değildir.
   * Zorunluluk zod şemasında (rejectApplicationSchema) da var; burası servis
   * katmanının kendi sözleşmesi — repository'den doğrudan çağıran bir yol
   * açılırsa kural yine tutar.
   */
  async rejectClubApplication(universityId: string, applicationId: string, actorUserId: string, note: string) {
    if (!note?.trim()) {
      throw badRequest("admin.rejectionNoteRequired");
    }
    const result = await adminRepository.decideClubApplication(universityId, applicationId, actorUserId, "rejected", note.trim());
    await notifyApplicationDecisionIfFinal(result);
    return result;
  },

  async requestClubApplicationRevision(
    universityId: string,
    applicationId: string,
    actorUserId: string,
    note: string
  ) {
    if (!note?.trim()) {
      throw badRequest("admin.revisionNoteRequired");
    }
    const trimmed = note.trim();
    const result = await adminRepository.requestClubApplicationRevision(
      universityId,
      applicationId,
      actorUserId,
      trimmed
    );
    const events = await adminRepository.findClubApplicationEvents(applicationId);
    const lastRevision = events.filter((e) => e.eventType === "revision_requested").at(-1);
    if (lastRevision) {
      await notifyApplicationRevisionRequested(result, trimmed, lastRevision.step);
    }
    return result;
  },

  async castCommitteeVote(
    universityId: string,
    applicationId: string,
    actorUserId: string,
    data: { vote: "approve" | "reject"; reason?: string }
  ) {
    if (data.vote === "approve") {
      await clubApplicationReviewService.assertChecklistAllowsApproval(universityId, applicationId);
    }

    const voteResult = await clubApplicationCommitteeService.castVote(
      universityId,
      applicationId,
      actorUserId,
      data
    );

    if (voteResult.finalized && voteResult.result) {
      await notifyApplicationDecisionIfFinal(voteResult.result);
      if (
        voteResult.result.application.status === "approved" &&
        voteResult.result.club
      ) {
        await membershipHistoryService.recordJoined(
          voteResult.result.club.id,
          voteResult.result.application.applicantId,
          universityId,
          "president",
          actorUserId
        );
        await clubEffects.clubApproved.emit(universityId);
      }
    }

    return voteResult;
  },

  async getClubApplicationHistory(universityId: string, applicationId: string) {
    const application = await adminRepository.findClubApplicationInUniversity(universityId, applicationId);
    if (!application) {
      throw notFound("admin.applicationNotFound");
    }
    const events = await adminRepository.findClubApplicationEvents(applicationId);
    const revisionRequestCount = events.filter((e) => e.eventType === "revision_requested").length;
    return {
      applicationId,
      revisionRequestCount,
      events: events.map((event) => ({
        id: event.id,
        step: event.step,
        eventType: event.eventType,
        note: event.note,
        proposedName: event.proposedName,
        description: event.description,
        createdAt: event.createdAt,
        actor: event.actor ? toSafeUser(event.actor) : null,
      })),
    };
  },

  async listClubs(universityId: string, status?: "pending" | "approved" | "rejected" | "archived") {
    return await adminRepository.findClubsByUniversity(universityId, status);
  },

  async getClub(universityId: string, clubId: string) {
    const row = await adminRepository.findClubDetailWithCounts(universityId, clubId);
    if (!row) {
      throw notFound("admin.clubNotFound");
    }
    const { club, memberCount, pendingJoinRequests, advisorCount, upcomingActivities } = row;
    return {
      ...club,
      counts: {
        members: memberCount,
        pendingJoinRequests,
        upcomingActivities,
        advisors: advisorCount,
      },
    };
  },

  async updateClubStatus(universityId: string, clubId: string, data: UpdateClubStatusDTO) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const updated = await adminRepository.updateClubStatus(universityId, clubId, data.status);
    // Durum onaylı<->diğer geçişi public listeye giriş/çıkışı belirler.
    await clubEffects.clubChangedDeeply.emit(universityId, clubId);
    return updated;
  },

  async updateClub(universityId: string, clubId: string, data: UpdateClubDTO) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const updated = await adminRepository.updateClub(universityId, clubId, data);
    await clubEffects.profileChanged.emit(universityId, clubId); // isim/logo listede + profilde
    return updated;
  },

  /**
   * Kulübü kalıcı olarak siler.
   * 1. Kulüp bu üniversiteye ait olmalı.
   * 2. Yalnızca "archived" veya "rejected" durumdaki kulüpler silinebilir —
   *    aktif (approved/pending) bir kulübü doğrudan silmek yerine önce arşivle.
   * 3. Bağlı içerik repository'de tek transaction'da temizlenir.
   */
  async deleteClub(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    if (club.status !== "archived" && club.status !== "rejected") {
      throw badRequest("admin.clubNotArchivedOrRejected");
    }
    await adminRepository.deleteClub(universityId, clubId);
    await clubEffects.clubChangedDeeply.emit(universityId, clubId);
    // Silinen kulübün duyuru/galeri listeleri de düşsün (repo bunları da temizler).
    await announcementEffects.changed.emit(clubId);
    await galleryEffects.changed.emit(clubId);
    return { id: clubId };
  },

  async listAdvisors(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const advisors = await adminRepository.findAdvisorsByClub(clubId);
    return advisors
      .filter((a) => a.user)
      .map((a) => ({ ...a, user: toSafeUser(a.user!) }));
  },

  /**
   * Danışman daveti — kabul edilene kadar kulüpte danışman sayılmaz.
   */
  async inviteAdvisor(
    universityId: string,
    clubId: string,
    invitedBy: string,
    data: { userId: string; message?: string }
  ) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const user = await adminRepository.findUserInUniversity(universityId, data.userId);
    if (!user) {
      throw notFound("admin.userNotFound");
    }

    const invitation = await clubAdvisorsService.inviteAdvisor(
      universityId,
      clubId,
      invitedBy,
      data,
      (userId) => adminRepository.userHasRole(userId, "advisor")
    );
    await clubEffects.detailChanged.emit(clubId);
    return invitation;
  },

  async listAdvisorInvitations(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    return await clubAdvisorsService.listClubInvitations(universityId, clubId);
  },

  async cancelAdvisorInvitation(
    universityId: string,
    clubId: string,
    invitationId: string,
    actorId: string
  ) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const result = await clubAdvisorsService.cancelInvitation(universityId, clubId, invitationId, actorId);
    await clubEffects.detailChanged.emit(clubId);
    return result;
  },

  /** Eski uç uyumluluğu — doğrudan atama yerine davet gönderir. */
  async addAdvisor(universityId: string, clubId: string, userId: string, invitedBy: string) {
    return await this.inviteAdvisor(universityId, clubId, invitedBy, { userId });
  },

  async removeAdvisor(universityId: string, clubId: string, userId: string, actorId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const existing = await adminRepository.findAdvisor(clubId, userId);
    if (!existing) {
      throw badRequest("admin.advisorNotAssigned");
    }
    await adminRepository.removeAdvisor(clubId, userId);
    await auditService.record({
      universityId,
      actorId,
      action: "club.advisor.removed",
      method: "DELETE",
      path: `/api/admin/universities/${universityId}/clubs/${clubId}/advisors/${userId}`,
      status: 200,
      targetType: "club",
      targetId: clubId,
      metadata: { userId },
    });
    await clubEffects.detailChanged.emit(clubId);
  },

  // ═══════════════════════════════════════════════
  // TENANT MODERASYON (bkz. docs/design/06 §A6)
  // Her işlem önce kulübün bu üniversiteye ait olduğunu doğrular; içerik de
  // gerçekten o kulübe ait olmalı (çapraz-kulüp silme engellenir).
  // ═══════════════════════════════════════════════
  async listClubMembers(universityId: string, clubId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const members = await adminRepository.findMembersByClub(clubId);
    return members
      .filter((m) => m.user)
      .map((m) => ({ ...m, user: toSafeUser(m.user!) }));
  },

  async listClubAnnouncements(
    universityId: string,
    clubId: string,
    limit: number,
    cursor?: string
  ) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const cursorDate = parseKeysetCursor(cursor);
    const rows = await adminRepository.listClubAnnouncementsForAdmin(clubId, limit, cursorDate);
    const { items, nextCursor } = paginateByCreatedAt(rows, limit);
    return {
      items: items
        .filter((a) => a.author)
        .map((a) => ({ ...a, author: toSafeUser(a.author!) })),
      nextCursor,
    };
  },

  async listClubGallery(
    universityId: string,
    clubId: string,
    limit: number,
    cursor?: string
  ) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const cursorDate = parseKeysetCursor(cursor);
    const rows = await adminRepository.listClubGalleryForAdmin(clubId, limit, cursorDate);
    const { items, nextCursor } = paginateByCreatedAt(rows, limit);
    return {
      items: items
        .filter((img) => img.uploader)
        .map((img) => ({ ...img, uploader: toSafeUser(img.uploader!) })),
      nextCursor,
    };
  },

  async listClubActivities(
    universityId: string,
    clubId: string,
    limit: number,
    cursor?: string
  ) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const cursorDate = parseKeysetCursor(cursor);
    const rows = await adminRepository.listClubActivitiesForAdmin(clubId, limit, cursorDate);
    const { items, nextCursor } = paginateByStartsAt(rows, limit);
    return { items, nextCursor };
  },

  async removeClubMember(universityId: string, clubId: string, userId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const membership = await adminRepository.findClubMember(clubId, userId);
    if (!membership) {
      throw badRequest("admin.memberNotFound");
    }
    await adminRepository.removeClubMember(clubId, userId);
    await clubEffects.membershipChanged.emit(clubId); // üye listesi + profil (üye gömülü)
  },

  async moderateRemoveAnnouncement(universityId: string, clubId: string, announcementId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const announcement = await adminRepository.findAnnouncementInClub(clubId, announcementId);
    if (!announcement) {
      throw notFound("admin.announcementNotFound");
    }
    await adminRepository.deleteAnnouncement(announcementId);
    await announcementEffects.changed.emit(clubId);
  },

  async moderateRemoveGalleryImage(universityId: string, clubId: string, imageId: string) {
    const club = await adminRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("admin.clubNotFound");
    }
    const image = await adminRepository.findGalleryImageInClub(clubId, imageId);
    if (!image) {
      throw notFound("admin.galleryImageNotFound");
    }
    await adminRepository.deleteGalleryImage(imageId);
    await galleryEffects.changed.emit(clubId);
  },
};
