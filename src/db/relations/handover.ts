import type { RelationHelpers } from "./types";

export const handoverRelations = (r: RelationHelpers) => ({
  clubHandoverRecords: {
    club: r.one.clubs({ from: r.clubHandoverRecords.clubId, to: r.clubs.id }),
    academicTerm: r.one.academicTerms({
      from: r.clubHandoverRecords.academicTermId,
      to: r.academicTerms.id,
    }),
    generalMeeting: r.one.clubGeneralMeetings({
      from: r.clubHandoverRecords.generalMeetingId,
      to: r.clubGeneralMeetings.id,
    }),
    recorder: r.one.users({
      from: r.clubHandoverRecords.recordedBy,
      to: r.users.id,
      alias: "handover_recorder",
    }),
  },
});
