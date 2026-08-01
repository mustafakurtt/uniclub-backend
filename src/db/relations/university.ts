import type { RelationHelpers } from "./types";

export const universityRelations = (r: RelationHelpers) => ({
  universities: {
    domains: r.many.universityDomains(),
    faculties: r.many.faculties(),
    users: r.many.users(),
    clubs: r.many.clubs(),
    announcements: r.many.announcements(),
    clubApplications: r.many.clubApplications(),
    academicTerms: r.many.academicTerms(),
  },
  universityDomains: {
    university: r.one.universities({
      from: r.universityDomains.universityId,
      to: r.universities.id,
    }),
  },
  faculties: {
    university: r.one.universities({
      from: r.faculties.universityId,
      to: r.universities.id,
    }),
    departments: r.many.departments(),
  },
  departments: {
    faculty: r.one.faculties({
      from: r.departments.facultyId,
      to: r.faculties.id,
    }),
    users: r.many.users(),
  },
});
