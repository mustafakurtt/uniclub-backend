import { clubsRepository } from "./clubs.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { notFound, badRequest } from "../../shared/utils/errors";
import { clubApplicationCommitteeService } from "./club-application-committee.service";

/** Kuruluş önerisi (destek toplama) yaşam döngüsü — öğrenci ve admin yüzleri. */
export const clubsFormationProposalsService = {
  async listFormationProposals(universityId: string, viewerId: string) {
    const settings = await getTenantSettings(universityId);
    const proposals = await clubsRepository.listCollectingFormationProposals(universityId, viewerId);
    return proposals.map((p) => ({
      id: p.id,
      proposedName: p.proposedName,
      description: p.description,
      status: p.status,
      supportCount: p.supportCount,
      supportThreshold: settings.clubFormationSupportThreshold,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
      hasSupported: p.hasSupported,
      proposer: p.proposer ? toSafeUser(p.proposer as unknown as Parameters<typeof toSafeUser>[0]) : null,
    }));
  },

  async getFormationProposal(universityId: string, proposalId: string, viewerId: string) {
    const proposal = await clubsRepository.findFormationProposalInUniversity(
      universityId,
      proposalId,
      viewerId
    );
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
      hasSupported: proposal.hasSupported,
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
      await clubApplicationCommitteeService.notifyIfCurrentStepIsCommittee(
        universityId,
        result.application.id
      );
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

  /** Admin panel — tüm durumlarda filtreli kuruluş önerisi listesi. */
  async listFormationProposalsForAdmin(
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

  /** Admin panel — kuruluş önerisi detayı (destekçi listesi dahil). */
  async getFormationProposalForAdmin(universityId: string, proposalId: string) {
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
};
