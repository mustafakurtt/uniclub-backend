import { getTenantSettings } from "../tenant-settings/tenant-settings.cache";
import { mediaRepository } from "../media/media.repository";
import { buildMediaPublicUrl } from "../media/media.service";
import { MediaPurpose } from "../media/media.types";
import { toSafeUser } from "../../shared/utils/user.util";
import { badRequest, forbidden, notFound } from "../../shared/utils/errors";
import type { ApplicationRequiredDocumentDef } from "./application-required-documents.core";
import { clubApplicationDocumentsRepository } from "./club-application-documents.repository";
import { clubApplicationReviewRepository } from "./club-application-review.repository";

const EDITABLE_APPLICATION_STATUSES = new Set(["pending", "revision_requested"]);

function extensionFromContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/webp") return "webp";
  const slash = contentType.indexOf("/");
  return slash >= 0 ? contentType.slice(slash + 1) : "bin";
}

export function buildMergedDocuments(
  catalog: ApplicationRequiredDocumentDef[],
  stored: Awaited<ReturnType<typeof clubApplicationDocumentsRepository.listByApplication>>
) {
  const storedByKey = new Map(stored.map((row) => [row.documentTypeKey, row]));
  return catalog.map((item) => {
    const row = storedByKey.get(item.key);
    const media = row?.media;
    const fileName = media ? `${item.label}.${extensionFromContentType(media.contentType)}` : null;
    return {
      documentTypeKey: item.key,
      label: item.label,
      required: item.required,
      uploadedAt: row?.createdAt ?? null,
      fileName,
      downloadUrl: media ? buildMediaPublicUrl(media.storageKey) : null,
      uploadedBy: row?.uploader ? toSafeUser(row.uploader) : null,
    };
  });
}

export const clubApplicationDocumentsService = {
  async buildDocumentsEnrichment(universityId: string, applicationId: string) {
    const settings = await getTenantSettings(universityId);
    const stored = await clubApplicationDocumentsRepository.listByApplication(applicationId);
    return {
      items: buildMergedDocuments(settings.clubApplicationRequiredDocuments, stored),
      requireDocumentsForSubmission: settings.clubApplicationRequireDocumentsForSubmission,
    };
  },

  async assertSubmissionAllowed(universityId: string, applicationId: string) {
    const settings = await getTenantSettings(universityId);
    if (!settings.clubApplicationRequireDocumentsForSubmission) return;

    const stored = await clubApplicationDocumentsRepository.listByApplication(applicationId);
    const uploadedKeys = new Set(stored.map((row) => row.documentTypeKey));
    const missing = settings.clubApplicationRequiredDocuments.filter(
      (item) => item.required && !uploadedKeys.has(item.key)
    );
    if (missing.length > 0) {
      throw badRequest("club.requiredDocumentsIncomplete");
    }
  },

  async linkDocumentsFromRefs(
    universityId: string,
    applicationId: string,
    applicantId: string,
    refs: { documentTypeKey: string; mediaId: string }[]
  ) {
    const settings = await getTenantSettings(universityId);
    const allowedKeys = new Set(settings.clubApplicationRequiredDocuments.map((d) => d.key));

    for (const ref of refs) {
      if (!allowedKeys.has(ref.documentTypeKey)) {
        throw badRequest("club.invalidDocumentType");
      }
      await this.validateAndUpsert(
        universityId,
        applicationId,
        applicantId,
        ref.documentTypeKey,
        ref.mediaId,
        { skipStatusCheck: true }
      );
    }
  },

  async validateAndUpsert(
    universityId: string,
    applicationId: string,
    applicantId: string,
    documentTypeKey: string,
    mediaId: string,
    options?: { skipStatusCheck?: boolean }
  ) {
    const application = await clubApplicationReviewRepository.findApplicationById(applicationId);
    if (!application || application.universityId !== universityId) {
      throw notFound("club.applicationNotFound");
    }
    if (application.applicantId !== applicantId) {
      throw forbidden("club.applicationDocumentForbidden");
    }
    if (!options?.skipStatusCheck && !EDITABLE_APPLICATION_STATUSES.has(application.status)) {
      throw badRequest("club.applicationDocumentNotEditable");
    }

    const settings = await getTenantSettings(universityId);
    const catalogItem = settings.clubApplicationRequiredDocuments.find((d) => d.key === documentTypeKey);
    if (!catalogItem) {
      throw badRequest("club.invalidDocumentType");
    }

    const media = await mediaRepository.findById(mediaId);
    if (!media) {
      throw badRequest("club.invalidDocumentMedia");
    }
    if (media.uploaderId !== applicantId) {
      throw forbidden("club.applicationDocumentForbidden");
    }
    if (media.universityId !== universityId) {
      throw notFound("club.applicationNotFound");
    }
    if (media.purpose !== MediaPurpose.APPLICATION_DOCUMENT) {
      throw badRequest("club.invalidDocumentMedia");
    }

    const row = await clubApplicationDocumentsRepository.upsertDocument(
      universityId,
      applicationId,
      documentTypeKey,
      mediaId,
      applicantId
    );
    return row;
  },

  async removeDocument(
    universityId: string,
    applicationId: string,
    applicantId: string,
    documentTypeKey: string
  ) {
    const application = await clubApplicationReviewRepository.findApplicationById(applicationId);
    if (!application || application.universityId !== universityId) {
      throw notFound("club.applicationNotFound");
    }
    if (application.applicantId !== applicantId) {
      throw forbidden("club.applicationDocumentForbidden");
    }
    if (!EDITABLE_APPLICATION_STATUSES.has(application.status)) {
      throw badRequest("club.applicationDocumentNotEditable");
    }

    const settings = await getTenantSettings(universityId);
    if (!settings.clubApplicationRequiredDocuments.some((d) => d.key === documentTypeKey)) {
      throw badRequest("club.invalidDocumentType");
    }

    const deleted = await clubApplicationDocumentsRepository.deleteDocument(applicationId, documentTypeKey);
    if (!deleted) {
      throw notFound("club.applicationDocumentNotFound");
    }
    return { documentTypeKey };
  },
};
