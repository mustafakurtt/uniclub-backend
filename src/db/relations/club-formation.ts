import type { RelationHelpers } from "./types";

export const clubFormationRelations = (r: RelationHelpers) => ({
  clubFormationProposals: {
    university: r.one.universities({ from: r.clubFormationProposals.universityId, to: r.universities.id }),
    proposer: r.one.users({ from: r.clubFormationProposals.proposerId, to: r.users.id }),
    application: r.one.clubApplications({
      from: r.clubFormationProposals.applicationId,
      to: r.clubApplications.id,
    }),
    supports: r.many.clubFormationSupports(),
  },
  clubFormationSupports: {
    proposal: r.one.clubFormationProposals({
      from: r.clubFormationSupports.proposalId,
      to: r.clubFormationProposals.id,
    }),
    supporter: r.one.users({ from: r.clubFormationSupports.supporterId, to: r.users.id }),
  },
});
