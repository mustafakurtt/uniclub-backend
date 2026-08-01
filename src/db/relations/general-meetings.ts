import type { RelationHelpers } from "./types";

export const generalMeetingsRelations = (r: RelationHelpers) => ({
  clubGeneralMeetings: {
    club: r.one.clubs({ from: r.clubGeneralMeetings.clubId, to: r.clubs.id }),
    academicTerm: r.one.academicTerms({
      from: r.clubGeneralMeetings.academicTermId,
      to: r.academicTerms.id,
    }),
    recorder: r.one.users({
      from: r.clubGeneralMeetings.recordedBy,
      to: r.users.id,
      alias: "general_meeting_recorder",
    }),
    attendees: r.many.clubGeneralMeetingAttendees(),
    boardMemberships: r.many.clubBoardMemberships(),
  },
  clubGeneralMeetingAttendees: {
    meeting: r.one.clubGeneralMeetings({
      from: r.clubGeneralMeetingAttendees.meetingId,
      to: r.clubGeneralMeetings.id,
    }),
    user: r.one.users({
      from: r.clubGeneralMeetingAttendees.userId,
      to: r.users.id,
      alias: "general_meeting_attendee",
    }),
  },
  clubBoardMemberships: {
    club: r.one.clubs({ from: r.clubBoardMemberships.clubId, to: r.clubs.id }),
    meeting: r.one.clubGeneralMeetings({
      from: r.clubBoardMemberships.generalMeetingId,
      to: r.clubGeneralMeetings.id,
    }),
    user: r.one.users({
      from: r.clubBoardMemberships.userId,
      to: r.users.id,
      alias: "board_member",
    }),
  },
});
