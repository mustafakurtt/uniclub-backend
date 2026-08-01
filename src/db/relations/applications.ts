import type { RelationHelpers } from "./types";

export const applicationsRelations = (r: RelationHelpers) => ({
  clubApplications: {
    university: r.one.universities({ from: r.clubApplications.universityId, to: r.universities.id }),
    applicant: r.one.users({ from: r.clubApplications.applicantId, to: r.users.id }),
    approvals: r.many.clubApplicationApprovals(),
    events: r.many.clubApplicationEvents(),
  },
  clubApplicationApprovals: {
    application: r.one.clubApplications({
      from: r.clubApplicationApprovals.applicationId,
      to: r.clubApplications.id,
    }),
    approver: r.one.users({
      from: r.clubApplicationApprovals.approverId,
      to: r.users.id,
    }),
  },
  clubApplicationEvents: {
    application: r.one.clubApplications({
      from: r.clubApplicationEvents.applicationId,
      to: r.clubApplications.id,
    }),
    actor: r.one.users({
      from: r.clubApplicationEvents.actorId,
      to: r.users.id,
    }),
  },
});
