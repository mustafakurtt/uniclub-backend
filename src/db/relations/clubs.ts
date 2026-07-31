import type { RelationHelpers } from "./types";

export const clubsRelations = (r: RelationHelpers) => ({
  clubs: {
    university: r.one.universities({
      from: r.clubs.universityId,
      to: r.universities.id,
    }),

    // --- KULLANICI İLİŞKİLERİ (Karşıt ALIAS'lar) ---
    creator: r.one.users({
      from: r.clubs.createdBy,
      to: r.users.id,
      alias: "creator_club", // users tarafındaki createdClubs ile eşleşir
    }),
    advisors: r.many.users({
      from: r.clubs.id.through(r.clubAdvisors.clubId),
      to: r.users.id.through(r.clubAdvisors.userId),
      alias: "advisor_club", // users tarafındaki advisedClubs ile eşleşir
    }),
    members: r.many.users({
      from: r.clubs.id.through(r.clubMembers.clubId),
      to: r.users.id.through(r.clubMembers.userId),
      alias: "member_club", // users tarafındaki joinedClubs ile eşleşir
    }),

    // Diğer bağlı veriler
    clubMembers: r.many.clubMembers(),
    clubAdvisors: r.many.clubAdvisors(),
    contactLinks: r.many.clubContactLinks(),
    gallery: r.many.clubGallery(),
    announcements: r.many.announcements(),

    // Etkinlikler (M:N — kulüp host ya da co_host olarak katılır).
    activities: r.many.activities({
      from: r.clubs.id.through(r.activityClubs.clubId),
      to: r.activities.id.through(r.activityClubs.activityId),
    }),
    activityClubs: r.many.activityClubs(),
  },
  clubAdvisors: {
    club: r.one.clubs({ from: r.clubAdvisors.clubId, to: r.clubs.id }),
    user: r.one.users({ from: r.clubAdvisors.userId, to: r.users.id }),
  },
  clubMembers: {
    club: r.one.clubs({ from: r.clubMembers.clubId, to: r.clubs.id }),
    user: r.one.users({ from: r.clubMembers.userId, to: r.users.id }),
  },
  clubContactLinks: {
    club: r.one.clubs({ from: r.clubContactLinks.clubId, to: r.clubs.id }),
  },
  clubGallery: {
    club: r.one.clubs({ from: r.clubGallery.clubId, to: r.clubs.id }),
    uploader: r.one.users({ from: r.clubGallery.uploadedBy, to: r.users.id }),
  },
});
