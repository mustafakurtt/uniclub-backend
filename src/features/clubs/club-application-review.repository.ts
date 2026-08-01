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
}

export const clubApplicationReviewRepository = new ClubApplicationReviewRepository();
