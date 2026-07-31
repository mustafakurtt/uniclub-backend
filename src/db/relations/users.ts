import type { RelationHelpers } from "./types";

export const usersRelations = (r: RelationHelpers) => ({
  users: {
    university: r.one.universities({
      from: r.users.universityId,
      to: r.universities.id,
    }),
    department: r.one.departments({
      from: r.users.departmentId,
      to: r.departments.id,
    }),
    emailVerifications: r.many.emailVerifications(),

    // --- KULÜP İLİŞKİLERİ (Aynı iki tablo arasında 3 farklı ilişki var, ALIAS ZORUNLU!) ---
    createdClubs: r.many.clubs({
      from: r.users.id,
      to: r.clubs.createdBy,
      alias: "creator_club", // Kulüp kurucusu
    }),
    advisedClubs: r.many.clubs({
      from: r.users.id.through(r.clubAdvisors.userId),
      to: r.clubs.id.through(r.clubAdvisors.clubId),
      alias: "advisor_club", // Kulüp danışmanı
    }),
    joinedClubs: r.many.clubs({
      from: r.users.id.through(r.clubMembers.userId),
      to: r.clubs.id.through(r.clubMembers.clubId),
      alias: "member_club", // Kulüp üyesi
    }),

    // --- ROLLER VE YETKİLER ---
    roles: r.many.roles({
      from: r.users.id.through(r.userRoles.userId),
      to: r.roles.id.through(r.userRoles.roleId),
    }),
    permissions: r.many.permissions({
      from: r.users.id.through(r.userPermissions.userId),
      to: r.permissions.id.through(r.userPermissions.permissionId),
    }),

    // --- DİĞER İÇERİKLER VE BAŞVURULAR ---
    galleryUploads: r.many.clubGallery({
      from: r.users.id,
      to: r.clubGallery.uploadedBy,
    }),
    announcements: r.many.announcements({
      from: r.users.id,
      to: r.announcements.authorId,
    }),
    applications: r.many.clubApplications({
      from: r.users.id,
      to: r.clubApplications.applicantId,
    }),
    approvals: r.many.clubApplicationApprovals({
      from: r.users.id,
      to: r.clubApplicationApprovals.approverId,
    }),

    notifications: r.many.notifications(),

    // --- ETKİNLİKLER (users↔activities arası 2 ilişki: oluşturan + katılan → ALIAS ZORUNLU) ---
    createdActivities: r.many.activities({
      from: r.users.id,
      to: r.activities.createdBy,
      alias: "creator_activity",
    }),
    attendingActivities: r.many.activities({
      from: r.users.id.through(r.activityAttendees.userId),
      to: r.activities.id.through(r.activityAttendees.activityId),
      alias: "attendee_activity",
    }),

    // Ara tablolara manuel sorgu atmak gerekirse diye:
    userRoles: r.many.userRoles(),
    userPermissions: r.many.userPermissions(),
    clubMemberships: r.many.clubMembers(),
    clubAdvisorships: r.many.clubAdvisors(),
    activityAttendances: r.many.activityAttendees(),
  },

  emailVerifications: {
    user: r.one.users({
      from: r.emailVerifications.userId,
      to: r.users.id,
    }),
  },
});
