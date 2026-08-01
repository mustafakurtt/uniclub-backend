import { auditService } from "../audit/audit.service";
import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { badRequest, notFound } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import type { ApplicationReviewChecklistItemDef } from "./application-review-checklist.core";
import { clubApplicationReviewRepository } from "./club-application-review.repository";
import { canActorDecideApprovalStep } from "./club-application-chain";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getRejectionApproval(
  approvals: {
    step: number;
    status: string;
    note: string | null;
    approverId: string | null;
    approverRole: string | null;
  }[]
) {
  return approvals.find((a) => a.status === "rejected");
}

export function buildMergedChecklist(
  catalog: ApplicationReviewChecklistItemDef[],
  stored: Awaited<ReturnType<typeof clubApplicationReviewRepository.listChecklistItems>>
) {
  const storedByKey = new Map(stored.map((row) => [row.itemKey, row]));
  return catalog.map((item) => {
    const row = storedByKey.get(item.key);
    return {
      key: item.key,
      label: item.label,
      required: item.required,
      checked: row?.checked ?? false,
      note: row?.note ?? null,
      checkedAt: row?.checkedAt ?? null,
      checkedBy: row?.checker ? toSafeUser(row.checker) : null,
    };
  });
}

export type AppealRecord = {
  status: string;
  note: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  reviewer?: { passwordHash: string } | null;
};

export function toAppealDto(appeal: AppealRecord | null | undefined) {
  if (!appeal) return null;
  return {
    status: appeal.status,
    reason: appeal.note,
    submittedAt: appeal.createdAt,
    reviewedAt: appeal.reviewedAt,
    reviewNote: appeal.reviewNote,
    reviewedBy: appeal.reviewer ? toSafeUser(appeal.reviewer) : null,
  };
}

export function computeAppealState(
  application: {
    status: string;
    rejectedAt: Date | null;
    rejectApproverId: string | null;
  },
  appealPeriodDays: number,
  appeal: AppealRecord | null | undefined,
  rejectionNote: string | null
) {
  const rejectionReason = application.status === "rejected" ? rejectionNote : null;
  const appealDeadline =
    application.rejectedAt && application.status === "rejected"
      ? addDays(application.rejectedAt, appealPeriodDays)
      : null;
  const canAppeal =
    application.status === "rejected" &&
    !appeal &&
    appealDeadline !== null &&
    new Date() <= appealDeadline;

  return {
    rejectionReason,
    appealDeadline,
    canAppeal,
    appeal: toAppealDto(appeal),
  };
}

export const clubApplicationReviewService = {
  async getChecklist(universityId: string, applicationId: string) {
    const application = await clubApplicationReviewRepository.findApplicationInUniversity(
      universityId,
      applicationId
    );
    if (!application) {
      throw notFound("admin.applicationNotFound");
    }

    const settings = await getTenantSettings(universityId);
    const stored = await clubApplicationReviewRepository.listChecklistItems(applicationId);

    return {
      items: buildMergedChecklist(settings.clubApplicationReviewChecklist, stored),
      requireChecklistForApproval: settings.clubApplicationRequireChecklistForApproval,
    };
  },

  async updateChecklistItem(
    universityId: string,
    applicationId: string,
    itemKey: string,
    actorUserId: string,
    checked: boolean,
    note?: string
  ) {
    const application = await clubApplicationReviewRepository.findApplicationInUniversity(
      universityId,
      applicationId
    );
    if (!application) {
      throw notFound("admin.applicationNotFound");
    }

    if (application.status !== "pending" && application.status !== "revision_requested") {
      throw badRequest("admin.checklistNotEditable");
    }

    const settings = await getTenantSettings(universityId);
    const catalogItem = settings.clubApplicationReviewChecklist.find((i) => i.key === itemKey);
    if (!catalogItem) {
      throw badRequest("admin.checklistItemUnknown");
    }

    const trimmedNote = note?.trim() || null;
    await clubApplicationReviewRepository.upsertChecklistItem(
      universityId,
      applicationId,
      itemKey,
      checked,
      trimmedNote,
      actorUserId
    );

    await auditService.record({
      universityId,
      actorId: actorUserId,
      action: "club.application.checklist.update",
      method: "PATCH",
      path: `/api/admin/universities/${universityId}/club-applications/${applicationId}/checklist/${itemKey}`,
      status: 200,
      targetType: "club_application",
      targetId: applicationId,
      metadata: { itemKey, checked, note: trimmedNote },
    });

    return await this.getChecklist(universityId, applicationId);
  },

  async assertChecklistAllowsApproval(universityId: string, applicationId: string) {
    const settings = await getTenantSettings(universityId);
    if (!settings.clubApplicationRequireChecklistForApproval) return;

    const stored = await clubApplicationReviewRepository.listChecklistItems(applicationId);
    const merged = buildMergedChecklist(settings.clubApplicationReviewChecklist, stored);
    const missing = merged.filter((item) => item.required && !item.checked);
    if (missing.length > 0) {
      throw badRequest("admin.checklistRequiredIncomplete");
    }
  },

  async submitAppeal(applicantId: string, applicationId: string, note: string) {
    const full = await clubApplicationReviewRepository.findApplicationById(applicationId);
    if (!full || full.applicantId !== applicantId) {
      throw notFound("club.applicationNotFound");
    }

    if (full.status !== "rejected") {
      throw badRequest("club.applicationAppealNotAllowed");
    }

    const existing = await clubApplicationReviewRepository.findAppealByApplicationId(applicationId);
    if (existing) {
      throw badRequest("club.applicationAppealAlreadySubmitted");
    }

    const settings = await getTenantSettings(full.universityId);
    if (!full.rejectedAt) {
      throw badRequest("club.applicationAppealNotAllowed");
    }

    const deadline = addDays(full.rejectedAt, settings.clubApplicationAppealPeriodDays);
    if (new Date() > deadline) {
      throw badRequest("club.applicationAppealDeadlinePassed");
    }

    const trimmed = note.trim();
    const appeal = await clubApplicationReviewRepository.createAppeal(
      full.universityId,
      applicationId,
      applicantId,
      trimmed
    );

    return { id: appeal.id, status: appeal.status };
  },

  async reviewAppeal(
    universityId: string,
    applicationId: string,
    reviewerId: string,
    decision: "upheld" | "dismissed",
    reviewNote: string
  ) {
    const application = await clubApplicationReviewRepository.findApplicationInUniversity(
      universityId,
      applicationId
    );
    if (!application) {
      throw notFound("admin.applicationNotFound");
    }

    const appeal = await clubApplicationReviewRepository.findAppealByApplicationId(applicationId);
    if (!appeal || appeal.status !== "pending") {
      throw notFound("admin.appealNotFound");
    }

    const rejectedApproval = getRejectionApproval(application.approvals);
    if (!rejectedApproval) {
      throw badRequest("admin.appealNotFound");
    }

    const canReview = await canActorDecideApprovalStep(
      reviewerId,
      rejectedApproval.approverRole,
      application.approvals.length
    );
    if (!canReview) {
      throw badRequest("admin.appealReviewForbidden");
    }

    const rejectApproverId =
      application.rejectApproverId ?? rejectedApproval.approverId ?? null;

    if (rejectApproverId && rejectApproverId === reviewerId) {
      const others = await clubApplicationReviewRepository.countOtherApplicationReviewers(
        universityId,
        reviewerId
      );
      if (others > 0) {
        throw badRequest("admin.appealSameReviewerForbidden");
      }
    }

    const sameActorAsRejector = rejectApproverId !== null && rejectApproverId === reviewerId;

    const trimmed = reviewNote.trim();
    const result = await clubApplicationReviewRepository.reviewAppeal(
      universityId,
      applicationId,
      reviewerId,
      decision,
      trimmed,
      sameActorAsRejector
    );

    if (!result) {
      throw notFound("admin.appealNotFound");
    }

    await auditService.record({
      universityId,
      actorId: reviewerId,
      action: `club.application.appeal.${decision}`,
      method: "PATCH",
      path: `/api/admin/universities/${universityId}/club-applications/${applicationId}/appeal/review`,
      status: 200,
      targetType: "club_application",
      targetId: applicationId,
      metadata: { decision, sameActorAsRejector, reviewNote: trimmed },
    });

    return {
      appeal: {
        status: result.appeal.status,
        sameActorAsRejector: result.appeal.sameActorAsRejector,
      },
      application: { id: result.application.id, status: result.application.status },
    };
  },

  async buildReviewEnrichment(
    universityId: string,
    applicationId: string,
    application: {
      status: string;
      rejectedAt: Date | null;
      rejectApproverId: string | null;
      approvals: { step: number; status: string; note: string | null; approverId: string | null; approverRole: string | null }[];
    },
    appeal: AppealRecord | null | undefined
  ) {
    const settings = await getTenantSettings(universityId);
    const stored = await clubApplicationReviewRepository.listChecklistItems(applicationId);
    const rejectionApproval = getRejectionApproval(application.approvals);
    const appealState = computeAppealState(
      application,
      settings.clubApplicationAppealPeriodDays,
      appeal,
      rejectionApproval?.note ?? null
    );

    return {
      checklist: {
        items: buildMergedChecklist(settings.clubApplicationReviewChecklist, stored),
        requireChecklistForApproval: settings.clubApplicationRequireChecklistForApproval,
      },
      rejectionReason: appealState.rejectionReason,
      appealDeadline: appealState.appealDeadline,
      canAppeal: appealState.canAppeal,
      appeal: appealState.appeal,
    };
  },
};
