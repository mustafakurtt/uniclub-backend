import type { RelationHelpers } from "./types";

export const announcementsRelations = (r: RelationHelpers) => ({
  announcements: {
    university: r.one.universities({ from: r.announcements.universityId, to: r.universities.id }),
    club: r.one.clubs({ from: r.announcements.clubId, to: r.clubs.id }),
    author: r.one.users({ from: r.announcements.authorId, to: r.users.id }),
  },
});
