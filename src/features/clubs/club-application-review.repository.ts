import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import {
  clubApplicationAppeals,
  clubApplicationApprovals,
  clubApplicationChecklistItems,
  clubApplicationEvents,
  clubApplications,
} from "../../db/schema";
import { slugify } from "../../shared/utils/slug.util";
import {
  deriveApplicationStatus,
  findCurrentApprovalStep,
  assertActorCanDecideCurrentStep,
  isCommitteeMajorityStep,
  type ApplicationApprovalRow,
} from "./club-application-chain";
import { approvalCommitteesRepository } from "../approval-committees/approval-committees.repository";
import { notFound, badRequest, forbidden } from "../../shared/utils/errors";
import type { Club, ClubApplication } from "./clubs.types";
import type { DecideClubApplicationResult } from "./club-application.types";

const MAX_SLUG_ATTEMPTS = 5;

type ApplicationStepDecision = "approved" | "rejected" | "revision_requested";
type ApplicationEventType = ApplicationStepDecision | "resubmitted";

type ApplicationWithApprovals = {
  id: string;
  universityId: string;
  applicantId: string;
  proposedName: string;
  description: string | null;
  status: ClubApplication["status"];
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

class ClubApplicationReviewRepository {
  findApplicationById(applicationId: string) {
    return db.query.clubApplications.findFirst({
      where: { id: applicationId },
      with: {
        approvals: { orderBy: { step: "asc" }, with: { approver: true } },
        checklistItems: { with: { checker: true } },
        appeal: { with: { reviewer: true } },
      },
    });
  }

  findApplicationInUniversity(universityId: string, applicationId: string) {
    return db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
      with: {
        approvals: { orderBy: { step: "asc" }, with: { approver: true } },
        checklistItems: { with: { checker: true } },
        appeal: { with: { reviewer: true } },
      },
    });
  }

  listChecklistItems(applicationId: string) {
    return db.query.clubApplicationChecklistItems.findMany({
      where: { applicationId },
      with: { checker: true },
    });
  }

  async upsertChecklistItem(
    universityId: string,
    applicationId: string,
    itemKey: string,
    checked: boolean,
    note: string | null,
    actorUserId: string
  ) {
    const now = new Date();
    const [row] = await db
      .insert(clubApplicationChecklistItems)
      .values({
        applicationId,
        universityId,
        itemKey,
        checked,
        note,
        checkedBy: checked ? actorUserId : null,
        checkedAt: checked ? now : null,
      })
      .onConflictDoUpdate({
        target: [clubApplicationChecklistItems.applicationId, clubApplicationChecklistItems.itemKey],
        set: {
          checked,
          note,
          checkedBy: checked ? actorUserId : null,
          checkedAt: checked ? now : null,
          updatedAt: now,
        },
      })
      .returning();

    await db.insert(clubApplicationEvents).values({
      applicationId,
      step: 0,
      eventType: "checklist_updated",
      actorId: actorUserId,
      note: `${itemKey}:${checked}`,
    });

    return row;
  }

  async countOtherApplicationReviewers(universityId: string, excludeUserId: string): Promise<number> {
    const rows = await db
      .select({ userId: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
      .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.userRoles.roleId))
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
      .where(
        and(
          eq(schema.users.universityId, universityId),
          eq(schema.users.status, "active"),
          ne(schema.users.id, excludeUserId),
          eq(schema.permissions.key, "application.view")
        )
      )
      .groupBy(schema.users.id);
    return rows.length;
  }

  findAppealByApplicationId(applicationId: string) {
    return db.query.clubApplicationAppeals.findFirst({
      where: { applicationId },
      with: { reviewer: true },
    });
  }

  async createAppeal(
    universityId: string,
    applicationId: string,
    applicantId: string,
    note: string
  ) {
    return db.transaction(async (tx) => {
      const [appeal] = await tx
        .insert(clubApplicationAppeals)
        .values({
          universityId,
          applicationId,
          applicantId,
          note,
          status: "pending",
        })
        .returning();

      await tx.insert(clubApplicationEvents).values({
        applicationId,
        step: 0,
        eventType: "appeal_submitted",
        actorId: applicantId,
        note,
      });

      return appeal;
    });
  }

  async reviewAppeal(
    universityId: string,
    applicationId: string,
    reviewerId: string,
    decision: "upheld" | "dismissed",
    reviewNote: string,
    sameActorAsRejector: boolean
  ) {
    return db.transaction(async (tx) => {
      const application = await tx.query.clubApplications.findFirst({
        where: { id: applicationId, universityId },
        with: { approvals: { orderBy: { step: "asc" } } },
      });
      if (!application) return null;

      const appeal = await tx.query.clubApplicationAppeals.findFirst({
        where: { applicationId },
      });
      if (!appeal || appeal.status !== "pending") return null;

      const eventType = decision === "upheld" ? "appeal_upheld" : "appeal_dismissed";

      await tx
        .update(clubApplicationAppeals)
        .set({
          status: decision,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNote,
          sameActorAsRejector,
          updatedAt: new Date(),
        })
        .where(eq(clubApplicationAppeals.id, appeal.id));

      await tx.insert(clubApplicationEvents).values({
        applicationId,
        step: 0,
        eventType,
        actorId: reviewerId,
        note: reviewNote,
      });

      if (decision === "upheld") {
        const rejectedApproval = application.approvals.find((a) => a.status === "rejected");
        if (rejectedApproval) {
          await tx
            .update(clubApplicationApprovals)
            .set({
              status: "pending",
              approverId: null,
              note: null,
              reviewedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(clubApplicationApprovals.id, rejectedApproval.id));
        }

        await tx
          .update(clubApplications)
          .set({
            status: "pending",
            rejectedAt: null,
            rejectApproverId: null,
            updatedAt: new Date(),
          })
          .where(eq(clubApplications.id, applicationId));
      }

      const [updatedAppeal] = await tx
        .select()
        .from(clubApplicationAppeals)
        .where(eq(clubApplicationAppeals.id, appeal.id));

      const [updatedApplication] = await tx
        .select()
        .from(clubApplications)
        .where(eq(clubApplications.id, applicationId));

      return { appeal: updatedAppeal, application: updatedApplication };
    });
  }

  findApplicationByApplicant(applicantId: string, applicationId: string) {
    return db.query.clubApplications.findFirst({
      where: { id: applicationId, applicantId },
    });
  }

  findApplicationEvents(applicationId: string) {
    return db.query.clubApplicationEvents.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
    });
  }

  findApplicationEventsWithActor(applicationId: string) {
    return db.query.clubApplicationEvents.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
      with: { actor: true },
    });
  }

  findClubApplicationsByUniversity(universityId: string, status?: ClubApplication["status"]) {
    return db.query.clubApplications.findMany({
      where: { universityId, ...(status ? { status } : {}) },
      with: {
        applicant: true,
        approvals: { orderBy: { step: "asc" } },
      },
    });
  }

  findClubApplicationInUniversity(universityId: string, applicationId: string) {
    return db.query.clubApplications.findFirst({
      where: { id: applicationId, universityId },
    });
  }

  findClubApplicationDetail(universityId: string, applicationId: string) {
    return db.query.clubApplications.findFirst({
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
  }

  async countClubApplicationRevisionRequests(applicationId: string): Promise<number> {
    const events = await db.query.clubApplicationEvents.findMany({
      where: { applicationId },
      columns: { eventType: true },
    });
    return events.filter((e) => e.eventType === "revision_requested").length;
  }

  /**
   * Başvuruyu onaylar/reddeder — yalnızca sıradaki kademe; özet durum adımlardan türetilir.
   * Onay tamamlandığında gerçek `clubs` satırı oluşturulur.
   */
  decideClubApplication(
    universityId: string,
    applicationId: string,
    actorUserId: string,
    decision: "approved" | "rejected",
    note: string | null
  ): Promise<DecideClubApplicationResult> {
    return db.transaction(async (tx) =>
      applyApplicationStepDecision(tx, universityId, applicationId, actorUserId, decision, note)
    );
  }

  /** Revizyon talebi — gerekçe zorunlu; önceki kademe onayları korunur. */
  requestClubApplicationRevision(
    universityId: string,
    applicationId: string,
    actorUserId: string,
    note: string
  ): Promise<DecideClubApplicationResult> {
    return db.transaction(async (tx) =>
      applyApplicationStepDecision(tx, universityId, applicationId, actorUserId, "revision_requested", note)
    );
  }

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
  }

  /** Kullanıcının belirli bir global role (örn. "advisor") sahip olup olmadığı. */
  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: { id: userId },
      with: { roles: { where: { name: roleName }, columns: { id: true } } },
    });
    return !!user && user.roles.length > 0;
  }
}

export const clubApplicationReviewRepository = new ClubApplicationReviewRepository();
