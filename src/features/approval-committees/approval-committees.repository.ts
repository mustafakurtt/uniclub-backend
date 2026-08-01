import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { approvalCommittees, approvalCommitteeMembers } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import { notFound } from "../../shared/utils/errors";

const committeesRepo = new BaseRepository(db, approvalCommittees);

export const approvalCommitteesRepository = {
  async listByUniversity(universityId: string) {
    return await db.query.approvalCommittees.findMany({
      where: { universityId },
      with: {
        members: {
          with: { user: true },
        },
      },
    });
  },

  async findByIdInUniversity(universityId: string, committeeId: string) {
    return await committeesRepo.findOne({ id: committeeId, universityId });
  },

  async findDetailInUniversity(universityId: string, committeeId: string) {
    return await db.query.approvalCommittees.findFirst({
      where: { id: committeeId, universityId },
      with: {
        members: {
          with: { user: true },
        },
      },
    });
  },

  async create(
    universityId: string,
    data: { name: string; memberUserIds: string[]; isActive?: boolean }
  ) {
    return await db.transaction(async (tx) => {
      const [committee] = await tx
        .insert(approvalCommittees)
        .values({
          universityId,
          name: data.name,
          isActive: data.isActive ?? true,
        })
        .returning();

      if (data.memberUserIds.length > 0) {
        await tx.insert(approvalCommitteeMembers).values(
          data.memberUserIds.map((userId) => ({
            committeeId: committee.id,
            userId,
            universityId,
          }))
        );
      }

      return committee;
    });
  },

  async update(
    universityId: string,
    committeeId: string,
    data: { name?: string; isActive?: boolean; memberUserIds?: string[] }
  ) {
    const existing = await committeesRepo.findOne({ id: committeeId, universityId });
    if (!existing) {
      throw notFound("approvalCommittee.notFound");
    }

    return await db.transaction(async (tx) => {
      const [committee] = await tx
        .update(approvalCommittees)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        })
        .where(and(eq(approvalCommittees.id, committeeId), eq(approvalCommittees.universityId, universityId)))
        .returning();

      if (data.memberUserIds) {
        await tx
          .delete(approvalCommitteeMembers)
          .where(eq(approvalCommitteeMembers.committeeId, committeeId));
        if (data.memberUserIds.length > 0) {
          await tx.insert(approvalCommitteeMembers).values(
            data.memberUserIds.map((userId) => ({
              committeeId,
              userId,
              universityId,
            }))
          );
        }
      }

      return committee;
    });
  },

  async countActiveMembers(committeeId: string, universityId: string): Promise<number> {
    const committee = await committeesRepo.findOne({ id: committeeId, universityId, isActive: true });
    if (!committee) return 0;
    const rows = await db.query.approvalCommitteeMembers.findMany({
      where: { committeeId, universityId },
      columns: { userId: true },
    });
    return rows.length;
  },

  async listMemberUserIds(committeeId: string, universityId: string): Promise<string[]> {
    const rows = await db.query.approvalCommitteeMembers.findMany({
      where: { committeeId, universityId },
      columns: { userId: true },
    });
    return rows.map((r) => r.userId);
  },

  async isActiveMember(committeeId: string, universityId: string, userId: string): Promise<boolean> {
    const committee = await committeesRepo.findOne({ id: committeeId, universityId, isActive: true });
    if (!committee) return false;
    const row = await db.query.approvalCommitteeMembers.findFirst({
      where: { committeeId, universityId, userId },
      columns: { userId: true },
    });
    return row != null;
  },

  async assertUsersInUniversity(universityId: string, userIds: string[]): Promise<boolean> {
    if (userIds.length === 0) return true;
    const users = await db.query.users.findMany({
      where: { universityId },
      columns: { id: true },
    });
    const set = new Set(users.map((u) => u.id));
    return userIds.every((id) => set.has(id));
  },
};
