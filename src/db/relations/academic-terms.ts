import type { RelationHelpers } from "./types";

export const academicTermsRelations = (r: RelationHelpers) => ({
  academicTerms: {
    university: r.one.universities({
      from: r.academicTerms.universityId,
      to: r.universities.id,
    }),
    membershipEvents: r.many.clubMembershipEvents(),
  },
});
