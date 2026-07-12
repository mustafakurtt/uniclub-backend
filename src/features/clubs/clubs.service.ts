import { clubsRepository } from "./clubs.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import {
  CreateApplicationDTO,
  UpdateMemberRoleDTO,
  CreateContactLinkDTO,
  UpdateOwnClubDTO,
} from "./clubs.schema";
import { notFound, badRequest } from "../../shared/utils/errors";

export const clubsService = {
  async listClubs(universityId: string, search?: string) {
    return await clubsRepository.findApprovedClubsByUniversity(universityId, search);
  },

  async getClubDetail(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubDetail(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    return {
      ...club,
      advisors: club.advisors.map(toSafeUser),
      clubMembers: club.clubMembers
        .filter((m) => m.user)
        .map((m) => ({ ...m, user: toSafeUser(m.user!) })),
    };
  },

  /** Kulübün onaylı üyeleri (rolleriyle) — kulüp var olmalı ve bu üniversiteye ait olmalı. */
  async listMembers(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    const members = await clubsRepository.findApprovedMembers(clubId);
    return members
      .filter((m) => m.user)
      .map((m) => ({ ...m, user: toSafeUser(m.user!) }));
  },

  /**
   * Bir kullanıcının aynı anda birden fazla bekleyen başvurusu olmasını engeller.
   */
  async createApplication(universityId: string, applicantId: string, data: CreateApplicationDTO) {
    const existingPending = await clubsRepository.findPendingApplicationByApplicant(universityId, applicantId);
    if (existingPending) {
      throw badRequest("club.pendingApplicationExists");
    }
    return await clubsRepository.createApplication(universityId, applicantId, data);
  },

  /** Başvuranın kendi başvurusunu onay adımlarıyla görüntülemesi. */
  async getMyApplication(applicantId: string, applicationId: string) {
    const application = await clubsRepository.findApplicationByApplicant(applicantId, applicationId);
    if (!application) {
      throw notFound("club.applicationNotFound");
    }
    return {
      ...application,
      approvals: application.approvals.map((a) => ({
        ...a,
        approver: a.approver ? toSafeUser(a.approver) : null,
      })),
    };
  },

  /**
   * Başvuruyu geri çekme.
   * 1. Başvuru başvurana ait olmalı.
   * 2. Sadece "pending" başvuru geri çekilebilir — değerlendirilmiş (approved/rejected)
   *    bir başvuru geri çekilemez.
   */
  async withdrawApplication(applicantId: string, applicationId: string) {
    const application = await clubsRepository.findApplicationByApplicant(applicantId, applicationId);
    if (!application) {
      throw notFound("club.applicationNotFound");
    }
    if (application.status !== "pending") {
      throw badRequest("club.applicationNotWithdrawable");
    }
    await clubsRepository.deleteApplication(applicationId);
    return { id: applicationId };
  },

  /**
   * Kulübe katılma.
   * 1. Kulüp bu üniversitede ve "approved" durumda olmalı (pending/rejected/archived
   *    kulüplere katılınamaz).
   * 2. Zaten üye/bekleyen istek yoksa; joinPolicy'ye göre approved ya da pending oluşur.
   */
  async joinClub(universityId: string, clubId: string, userId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    if (club.status !== "approved") {
      throw badRequest("club.notOpenForMembership");
    }

    const existingMembership = await clubsRepository.findMembership(clubId, userId);
    if (existingMembership) {
      throw badRequest("club.alreadyMemberOrPending");
    }

    const status = club.joinPolicy === "open" ? "approved" : "pending";
    return await clubsRepository.addMembership(clubId, userId, status);
  },

  async leaveClub(universityId: string, clubId: string, userId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }

    const membership = await clubsRepository.findMembership(clubId, userId);
    if (!membership) {
      throw badRequest("club.notAMember");
    }

    if (membership.role === "president") {
      throw badRequest("club.presidentCannotLeave");
    }

    await clubsRepository.removeMembership(clubId, userId);
  },

  /**
   * Başkanın kendi kulübünün profilini güncellemesi (ad/açıklama/logo/kapak/joinPolicy).
   * Durum (status) buradan değiştirilemez — o okul yöneticisinin işidir.
   */
  async updateOwnClub(universityId: string, clubId: string, data: UpdateOwnClubDTO) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    return await clubsRepository.updateOwnClub(clubId, data);
  },

  async listJoinRequests(universityId: string, clubId: string) {
    const club = await clubsRepository.findClubInUniversity(universityId, clubId);
    if (!club) {
      throw notFound("club.notFound");
    }
    const requests = await clubsRepository.findPendingJoinRequests(clubId);
    return requests
      .filter((r) => r.user)
      .map((r) => ({ ...r, user: toSafeUser(r.user!) }));
  },

  async decideJoinRequest(clubId: string, targetUserId: string, decision: "approved" | "rejected") {
    const membership = await clubsRepository.findMembership(clubId, targetUserId);
    if (!membership || membership.status !== "pending") {
      throw notFound("club.pendingJoinRequestNotFound");
    }
    const updated = await clubsRepository.updateMembershipStatus(clubId, targetUserId, decision);

    const club = await clubsRepository.findClubById(clubId);
    const approved = decision === "approved";
    await notificationsService.notifySafe(targetUserId, {
      type: NotificationType.CLUB_MEMBERSHIP_DECIDED,
      title: approved ? "Kulübe kabul edildiniz" : "Kulüp katılım isteğiniz reddedildi",
      body: approved
        ? `'${club?.name ?? "Kulüp"}' üyeliğiniz onaylandı.`
        : `'${club?.name ?? "Kulüp"}' katılım isteğiniz olumsuz sonuçlandı.`,
      data: { clubId, status: decision },
    });

    return updated;
  },

  async removeMember(clubId: string, targetUserId: string) {
    const membership = await clubsRepository.findMembership(clubId, targetUserId);
    if (!membership) {
      throw notFound("club.memberNotFound");
    }
    if (membership.role === "president") {
      throw badRequest("club.presidentCannotBeRemoved");
    }
    await clubsRepository.removeMembership(clubId, targetUserId);
  },

  /**
   * Sadece member <-> officer arasında geçiş yapılabilir; başkanlık devri
   * ayrı bir endpoint'tir (transferPresidency).
   */
  async updateMemberRole(clubId: string, targetUserId: string, data: UpdateMemberRoleDTO) {
    const membership = await clubsRepository.findMembership(clubId, targetUserId);
    if (!membership || membership.status !== "approved") {
      throw notFound("club.memberNotFound");
    }
    if (membership.role === "president") {
      throw badRequest("club.presidentRoleCannotChange");
    }
    return await clubsRepository.updateMembershipRole(clubId, targetUserId, data.role);
  },

  /**
   * Başkanlık devri (sadece mevcut başkan tetikler).
   * 1. Hedef, başkanın kendisi olamaz.
   * 2. Hedef, kulübün ONAYLI bir üyesi olmalı.
   * 3. Devir sonrası eski başkan officer'a düşer, yeni kişi başkan olur (tek transaction).
   */
  async transferPresidency(clubId: string, currentPresidentId: string, newPresidentId: string) {
    if (currentPresidentId === newPresidentId) {
      throw badRequest("club.cannotTransferToSelf");
    }

    const target = await clubsRepository.findMembership(clubId, newPresidentId);
    if (!target || target.status !== "approved") {
      throw badRequest("club.newPresidentMustBeApprovedMember");
    }

    return await clubsRepository.transferPresidency(clubId, currentPresidentId, newPresidentId);
  },

  async addContactLink(clubId: string, data: CreateContactLinkDTO) {
    const existing = await clubsRepository.findContactLinkByPlatform(clubId, data.platform);
    if (existing) {
      throw badRequest("club.contactLinkPlatformExists");
    }
    return await clubsRepository.createContactLink(clubId, data);
  },

  async updateContactLink(clubId: string, linkId: string, url: string) {
    const existing = await clubsRepository.findContactLink(clubId, linkId);
    if (!existing) {
      throw notFound("club.contactLinkNotFound");
    }
    return await clubsRepository.updateContactLink(clubId, linkId, url);
  },

  async removeContactLink(clubId: string, linkId: string) {
    const existing = await clubsRepository.findContactLink(clubId, linkId);
    if (!existing) {
      throw notFound("club.contactLinkNotFound");
    }
    await clubsRepository.deleteContactLink(clubId, linkId);
  },
};
