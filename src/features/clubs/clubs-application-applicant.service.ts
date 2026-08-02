import { clubsRepository } from "./clubs.repository";
import { toSafeUser } from "../../shared/utils/user.util";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import {
  CreateApplicationDTO,
  ResubmitApplicationDTO,
} from "./clubs.schema";
import { notFound, badRequest } from "../../shared/utils/errors";
import { findRevisionRequestedStep } from "./club-application-chain.core";
import { clubApplicationReviewService } from "./club-application-review.service";
import { clubApplicationCommitteeService } from "./club-application-committee.service";
import { clubApplicationDocumentsService } from "./club-application-documents.service";

/** Başvuran tarafı — kuruluş başvurusu oluşturma, görüntüleme, revizyon ve geri çekme. */
export const clubsApplicationApplicantService = {
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

    if (settings.clubApplicationRequireDocumentsForSubmission) {
      const refs = data.documents ?? [];
      const keys = new Set(refs.map((r) => r.documentTypeKey));
      const missing = settings.clubApplicationRequiredDocuments.filter(
        (item) => item.required && !keys.has(item.key)
      );
      if (missing.length > 0) {
        throw badRequest("club.requiredDocumentsIncomplete");
      }
    }

    const application = await clubsRepository.createApplication(universityId, applicantId, data);
    if (data.documents?.length) {
      await clubApplicationDocumentsService.linkDocumentsFromRefs(
        universityId,
        application.id,
        applicantId,
        data.documents
      );
    }
    await clubApplicationDocumentsService.assertSubmissionAllowed(universityId, application.id);
    await clubApplicationCommitteeService.notifyIfCurrentStepIsCommittee(universityId, application.id);
    return { ...application, kind: "application" as const };
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

    const review = await clubApplicationReviewService.buildReviewEnrichment(
      application.universityId,
      applicationId,
      application,
      application.appeal
    );

    const mappedApprovals = application.approvals.map((a) => ({
      step: a.step,
      stepKind: a.stepKind,
      committeeId: a.committeeId,
      approverRole: a.approverRole,
      status: a.status,
      note: a.note,
      reviewedAt: a.reviewedAt,
      approver: a.approver ? toSafeUser(a.approver) : null,
    }));
    const approvalsWithTally = await clubApplicationCommitteeService.enrichApprovalsWithCommitteeTally(
      application.universityId,
      applicationId,
      mappedApprovals,
      applicantId,
      true
    );

    return {
      ...application,
      approvals: approvalsWithTally,
      documents: review.documents,
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
      rejectionReason: review.rejectionReason,
      appealDeadline: review.appealDeadline,
      canAppeal: review.canAppeal,
      appeal: review.appeal,
    };
  },

  /** Revizyon talebi sonrası başvuruyu güncelle ve yeniden gönder — aynı kayıt devam eder. */
  async resubmitApplication(applicantId: string, applicationId: string, data: ResubmitApplicationDTO) {
    const existing = await clubsRepository.findApplicationByApplicant(applicantId, applicationId);
    if (!existing || existing.status !== "revision_requested") {
      throw badRequest("club.applicationNotResubmittable");
    }

    if (data.documents?.length) {
      await clubApplicationDocumentsService.linkDocumentsFromRefs(
        existing.universityId,
        applicationId,
        applicantId,
        data.documents
      );
    }
    await clubApplicationDocumentsService.assertSubmissionAllowed(existing.universityId, applicationId);

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
};
