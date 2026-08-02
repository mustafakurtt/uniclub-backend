import type { RelationHelpers } from "./types";

export const applicationsRelations = (r: RelationHelpers) => ({
  clubApplications: {
    university: r.one.universities({ from: r.clubApplications.universityId, to: r.universities.id }),
    applicant: r.one.users({ from: r.clubApplications.applicantId, to: r.users.id }),
    approvals: r.many.clubApplicationApprovals(),
    events: r.many.clubApplicationEvents(),
    checklistItems: r.many.clubApplicationChecklistItems(),
    documents: r.many.clubApplicationDocuments(),
    appeal: r.one.clubApplicationAppeals({
      from: r.clubApplications.id,
      to: r.clubApplicationAppeals.applicationId,
    }),
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
    committee: r.one.approvalCommittees({
      from: r.clubApplicationApprovals.committeeId,
      to: r.approvalCommittees.id,
    }),
  },
  clubApplicationCommitteeVotes: {
    application: r.one.clubApplications({
      from: r.clubApplicationCommitteeVotes.applicationId,
      to: r.clubApplications.id,
    }),
    committee: r.one.approvalCommittees({
      from: r.clubApplicationCommitteeVotes.committeeId,
      to: r.approvalCommittees.id,
    }),
    voter: r.one.users({
      from: r.clubApplicationCommitteeVotes.voterUserId,
      to: r.users.id,
      alias: "committee_vote_voter",
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
  clubApplicationChecklistItems: {
    application: r.one.clubApplications({
      from: r.clubApplicationChecklistItems.applicationId,
      to: r.clubApplications.id,
    }),
    checker: r.one.users({
      from: r.clubApplicationChecklistItems.checkedBy,
      to: r.users.id,
    }),
  },
  clubApplicationAppeals: {
    application: r.one.clubApplications({
      from: r.clubApplicationAppeals.applicationId,
      to: r.clubApplications.id,
    }),
    applicant: r.one.users({
      from: r.clubApplicationAppeals.applicantId,
      to: r.users.id,
    }),
    reviewer: r.one.users({
      from: r.clubApplicationAppeals.reviewedBy,
      to: r.users.id,
    }),
  },
  clubApplicationDocuments: {
    application: r.one.clubApplications({
      from: r.clubApplicationDocuments.applicationId,
      to: r.clubApplications.id,
    }),
    media: r.one.media({
      from: r.clubApplicationDocuments.mediaId,
      to: r.media.id,
    }),
    uploader: r.one.users({
      from: r.clubApplicationDocuments.uploadedBy,
      to: r.users.id,
    }),
  },
});
