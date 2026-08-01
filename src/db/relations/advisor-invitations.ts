import type { RelationHelpers } from "./types";

export const advisorInvitationsRelations = (r: RelationHelpers) => ({
  clubAdvisorInvitations: {
    club: r.one.clubs({
      from: r.clubAdvisorInvitations.clubId,
      to: r.clubs.id,
    }),
    invitee: r.one.users({
      from: r.clubAdvisorInvitations.inviteeUserId,
      to: r.users.id,
      alias: "advisor_invitation_invitee",
    }),
    inviter: r.one.users({
      from: r.clubAdvisorInvitations.invitedBy,
      to: r.users.id,
      alias: "advisor_invitation_inviter",
    }),
  },
});
