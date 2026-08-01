import { approvalCommitteesRepository } from "./approval-committees.repository";
import { badRequest, notFound } from "../../shared/utils/errors";
import { toSafeUser } from "../../shared/utils/user.util";
import type { CreateApprovalCommitteeDTO, UpdateApprovalCommitteeDTO } from "./approval-committees.schema";

function mapCommittee(
  committee: NonNullable<Awaited<ReturnType<typeof approvalCommitteesRepository.findDetailInUniversity>>>
) {
  return {
    id: committee.id,
    name: committee.name,
    isActive: committee.isActive,
    createdAt: committee.createdAt,
    updatedAt: committee.updatedAt,
    members: committee.members
      .filter((m) => m.user)
      .map((m) => ({
        userId: m.userId,
        user: toSafeUser(m.user!),
      })),
  };
}

export const approvalCommitteesService = {
  async list(universityId: string) {
    const committees = await approvalCommitteesRepository.listByUniversity(universityId);
    return committees.map((c) => mapCommittee(c as NonNullable<typeof c>));
  },

  async getById(universityId: string, committeeId: string) {
    const committee = await approvalCommitteesRepository.findDetailInUniversity(universityId, committeeId);
    if (!committee) {
      throw notFound("approvalCommittee.notFound");
    }
    return mapCommittee(committee);
  },

  async create(universityId: string, data: CreateApprovalCommitteeDTO) {
    const validMembers = await approvalCommitteesRepository.assertUsersInUniversity(
      universityId,
      data.memberUserIds
    );
    if (!validMembers) {
      throw badRequest("approvalCommittee.invalidMembers");
    }
    const committee = await approvalCommitteesRepository.create(universityId, data);
    return await this.getById(universityId, committee.id);
  },

  async update(universityId: string, committeeId: string, data: UpdateApprovalCommitteeDTO) {
    const existing = await approvalCommitteesRepository.findByIdInUniversity(universityId, committeeId);
    if (!existing) {
      throw notFound("approvalCommittee.notFound");
    }
    if (data.memberUserIds) {
      const validMembers = await approvalCommitteesRepository.assertUsersInUniversity(
        universityId,
        data.memberUserIds
      );
      if (!validMembers) {
        throw badRequest("approvalCommittee.invalidMembers");
      }
    }
    await approvalCommitteesRepository.update(universityId, committeeId, data);
    return await this.getById(universityId, committeeId);
  },
};
