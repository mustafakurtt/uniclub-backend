import { clubsRepository } from "./clubs.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import {
  CreateApplicationDTO,
  ResubmitApplicationDTO,
  UpdateMemberRoleDTO,
  CreateContactLinkDTO,
  UpdateOwnClubDTO,
} from "./clubs.schema";
import { notFound, badRequest } from "../../shared/utils/errors";
import { clubsCache, clubEffects } from "./clubs.cache";
import { findRevisionRequestedStep } from "./club-application-chain.core";

export const clubsService = {
  async listClubs(universityId: string, search?: string) {
    // Arama sonuçları cache'lenmez (çok anahtar); yalnızca aramasız public liste.
    if (search) {
      return await clubsRepository.findApprovedClubsByUniversity(universityId, search);
    }
    return await clubsCache.list(universityId).read(() =>
      clubsRepository.findApprovedClubsByUniversity(universityId)
    );
  },

  async getClubDetail(universityId: string, clubId: string) {
    // clubId global benzersiz → cache clubId ile anahtarlanır; loader tenant-filtresiz
    // yükler, tenant doğrulaması cache DIŞINDA yapılır (yanlış tenant cache hit'te sızmasın).
    const club = await clubsCache.detail(clubId).read(() => clubsRepository.findClubDetailById(clubId));
    if (!club || club.universityId !== universityId) {
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
    // Tenant guard (yukarıda) cache DIŞINDA; üye listesi clubId ile cache'lenir.
    const members = await clubsCache.members(clubId).read(() =>
      clubsRepository.findApprovedMembers(clubId)
    );
    return members
      .filter((m) => m.user)
      .map((m) => ({ ...m, user: toSafeUser(m.user!) }));
  },

  /**
   * Kulüp kurma başvurusu veya (tenant ayarı açıksa) kuruluş önerisi.
   * Aynı anda tek aktif başvuru veya destek toplama önerisi.
   */
  async createApplication(universityId: string, applicantId: string, data: CreateApplicationDTO) {
    const existingPending = await clubsRepository.findActiveApplicationByApplicant(universityId, applicantId);
    const existingProposal = await clubsRepository.findActiveFormationProposalByProposer(universityId, applicantId);
    if (existingPending || existingProposal) {
      throw badRequest("club.pendingApplicationExists");
    }

    const settings = await getTenantSettings(universityId);
    if (settings.clubFormationSupportThreshold > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + settings.clubFormationProposalExpiryDays);
      const proposal = await clubsRepository.createFormationProposal(
        universityId,
        applicantId,
        data,
        expiresAt
      );
      return {
        ...proposal,
        kind: "formation_proposal" as const,
        supportThreshold: settings.clubFormationSupportThreshold,
      };
    }

    const application = await clubsRepository.createApplication(universityId, applicantId, data);
    return { ...application, kind: "application" as const };
  },

  async listFormationProposals(universityId: string) {
    const settings = await getTenantSettings(universityId);
    const proposals = await clubsRepository.listCollectingFormationProposals(universityId);
    return proposals.map((p) => ({
      id: p.id,
      proposedName: p.proposedName,
      description: p.description,
      status: p.status,
      supportCount: p.supportCount,
      supportThreshold: settings.clubFormationSupportThreshold,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
      proposer: p.proposer ? toSafeUser(p.proposer) : null,
    }));
  },

  async getFormationProposal(universityId: string, proposalId: string, viewerId: string) {
    const proposal = await clubsRepository.findFormationProposalInUniversity(universityId, proposalId);
    if (!proposal) {
      throw notFound("club.formationProposalNotFound");
    }
    const settings = await getTenantSettings(universityId);
    const isProposer = proposal.proposerId === viewerId;
    return {
      id: proposal.id,
      proposedName: proposal.proposedName,
      description: proposal.description,
      status: proposal.status,
      supportCount: proposal.supportCount,
      supportThreshold: settings.clubFormationSupportThreshold,
      expiresAt: proposal.expiresAt,
      submittedAt: proposal.submittedAt,
      applicationId: proposal.applicationId,
      createdAt: proposal.createdAt,
      proposer: proposal.proposer ? toSafeUser(proposal.proposer) : null,
      isProposer,
    };
  },

  async supportFormationProposal(universityId: string, proposalId: string, supporterId: string) {
    const proposal = await clubsRepository.findFormationProposalById(proposalId);
    if (!proposal || proposal.universityId !== universityId) {
      throw notFound("club.formationProposalNotFound");
    }

    const settings = await getTenantSettings(universityId);
    if (settings.clubFormationSupportThreshold <= 0) {
      throw badRequest("club.formationSupportDisabled");
    }

    const result = await clubsRepository.addFormationSupport(
      universityId,
      proposalId,
      supporterId,
      settings.clubFormationSupportThreshold
    );

    if (result.status === "not_found") throw notFound("club.formationProposalNotFound");
    if (result.status === "self_support") throw badRequest("club.cannotSupportOwnProposal");
    if (result.status === "already_supported") throw badRequest("club.formationAlreadySupported");

    if (result.thresholdReached && result.application) {
      await notificationsService.notifySafe(result.proposal.proposerId, {
        type: NotificationType.CLUB_FORMATION_THRESHOLD_REACHED,
        title: "Kuruluş öneriniz onay sürecine girdi",
        body: `'${result.proposal.proposedName}' öneriniz yeterli desteği topladı ve okul incelemesine gönderildi.`,
        data: {
          proposalId: result.proposal.id,
          applicationId: result.application.id,
        },
      });
    }

    return {
      proposal: result.proposal,
      application: result.application,
      thresholdReached: result.thresholdReached,
      supportCount: result.proposal.supportCount,
    };
  },

  async withdrawFormationSupport(proposalId: string, supporterId: string) {
    const updated = await clubsRepository.removeFormationSupport(proposalId, supporterId);
    if (!updated) {
      throw badRequest("club.formationSupportNotFound");
    }
    return { proposalId, supportCount: updated.supportCount };
  },

  async withdrawFormationProposal(proposerId: string, proposalId: string) {
    const updated = await clubsRepository.withdrawFormationProposal(proposerId, proposalId);
    if (!updated) {
      throw badRequest("club.formationProposalNotWithdrawable");
    }
    return { id: proposalId };
  },

  /** Başvuranın kendi başvurusunu onay adımlarıyla görüntülemesi. */
  async getMyApplication(applicantId: string, applicationId: string) {
    const application = await clubsRepository.findApplicationByApplicant(applicantId, applicationId);
    if (!application) {
      throw notFound("club.applicationNotFound");
    }

    const revisionRow =
      application.status === "revision_requested"
        ? findRevisionRequestedStep(application.approvals)
        : null;
    const revisionApproval = revisionRow
      ? application.approvals.find((a) => a.step === revisionRow.step)
      : null;

    return {
      ...application,
      approvals: application.approvals.map((a) => ({
        ...a,
        approver: a.approver ? toSafeUser(a.approver) : null,
      })),
      revisionRequest: revisionApproval
        ? {
            step: revisionApproval.step,
            note: revisionApproval.note,
            requestedAt: revisionApproval.reviewedAt,
            requestedBy: revisionApproval.approver
              ? toSafeUser(revisionApproval.approver)
              : null,
          }
        : null,
    };
  },

  /** Revizyon talebi sonrası başvuruyu güncelle ve yeniden gönder — aynı kayıt devam eder. */
  async resubmitApplication(applicantId: string, applicationId: string, data: ResubmitApplicationDTO) {
    const updated = await clubsRepository.resubmitApplication(applicationId, applicantId, data);
    if (!updated) {
      throw badRequest("club.applicationNotResubmittable");
    }
    return updated;
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
    // Tenant, KULÜBÜN kaydından alınır (çağırandan değil): `findClubInUniversity`
    // zaten kulübün bu tenant'ta olduğunu doğruladı, dolayısıyla ikisi eşit —
    // ama kaynağı kulüp yapmak, bileşik FK'nin beklediği değeri tek doğru
    // yerden okumak demek (bkz. db/schema.ts → clubMembers).
    const membership = await clubsRepository.addMembership(
      clubId,
      userId,
      club.universityId,
      status
    );
    // Yalnızca "approved" (open policy) üye listesini/profili değiştirir; pending değil.
    if (status === "approved") {
      await clubEffects.membershipChanged.emit(clubId);
    }
    return membership;
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
    // Ayrılan üye onaylıysa listeyi/profili etkiler; pending istekte membership
    // zaten listede değildi ama invalidasyon ucuz + güvenli.
    await clubEffects.membershipChanged.emit(clubId);
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
    const updated = await clubsRepository.updateOwnClub(clubId, data);
    await clubEffects.profileChanged.emit(universityId, clubId); // isim/logo listede de görünür
    return updated;
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
    // Onaylanan istek üye listesine girer; reddedilen zaten listede değildi.
    if (decision === "approved") {
      await clubEffects.membershipChanged.emit(clubId);
    }

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
    await clubEffects.membershipChanged.emit(clubId);
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
    const updated = await clubsRepository.updateMembershipRole(clubId, targetUserId, data.role);
    await clubEffects.membershipChanged.emit(clubId); // rol üye listesinde görünür
    return updated;
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

    const result = await clubsRepository.transferPresidency(clubId, currentPresidentId, newPresidentId);
    await clubEffects.membershipChanged.emit(clubId); // roller üye listesinde görünür
    return result;
  },

  async addContactLink(clubId: string, data: CreateContactLinkDTO) {
    const existing = await clubsRepository.findContactLinkByPlatform(clubId, data.platform);
    if (existing) {
      throw badRequest("club.contactLinkPlatformExists");
    }
    const result = await clubsRepository.createContactLink(clubId, data);
    await clubEffects.detailChanged.emit(clubId); // iletişim linkleri profile gömülü
    return result;
  },

  async updateContactLink(clubId: string, linkId: string, url: string) {
    const existing = await clubsRepository.findContactLink(clubId, linkId);
    if (!existing) {
      throw notFound("club.contactLinkNotFound");
    }
    const result = await clubsRepository.updateContactLink(clubId, linkId, url);
    await clubEffects.detailChanged.emit(clubId);
    return result;
  },

  async removeContactLink(clubId: string, linkId: string) {
    const existing = await clubsRepository.findContactLink(clubId, linkId);
    if (!existing) {
      throw notFound("club.contactLinkNotFound");
    }
    await clubsRepository.deleteContactLink(clubId, linkId);
    await clubEffects.detailChanged.emit(clubId);
  },
};
