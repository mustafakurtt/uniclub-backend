import type { RelationHelpers } from "./types";

export const membershipEventsRelations = (r: RelationHelpers) => ({
  clubMembershipEvents: {
    club: r.one.clubs({ from: r.clubMembershipEvents.clubId, to: r.clubs.id }),
    user: r.one.users({ from: r.clubMembershipEvents.userId, to: r.users.id }),
    actor: r.one.users({
      from: r.clubMembershipEvents.actorId,
      to: r.users.id,
      alias: "membership_event_actor",
    }),
    academicTerm: r.one.academicTerms({
      from: r.clubMembershipEvents.academicTermId,
      to: r.academicTerms.id,
    }),
  },
});
