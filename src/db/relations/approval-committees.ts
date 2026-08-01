import type { RelationHelpers } from "./types";

export const approvalCommitteesRelations = (r: RelationHelpers) => ({
  approvalCommittees: {
    university: r.one.universities({
      from: r.approvalCommittees.universityId,
      to: r.universities.id,
    }),
    members: r.many.approvalCommitteeMembers(),
  },
  approvalCommitteeMembers: {
    committee: r.one.approvalCommittees({
      from: r.approvalCommitteeMembers.committeeId,
      to: r.approvalCommittees.id,
    }),
    user: r.one.users({
      from: r.approvalCommitteeMembers.userId,
      to: r.users.id,
      alias: "approval_committee_member",
    }),
  },
});
