import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  // ═══════════════════════════════════════════════
  // TENANT, OKUL & BÖLÜM (SaaS Hiyerarşisi)
  // ═══════════════════════════════════════════════
  universities: {
    domains: r.many.universityDomains(),
    faculties: r.many.faculties(),
    users: r.many.users(),
    clubs: r.many.clubs(),
    announcements: r.many.announcements(),
    clubApplications: r.many.clubApplications(),
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

  // ═══════════════════════════════════════════════
  // KULLANICILAR (USERS)
  // ═══════════════════════════════════════════════
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

  notifications: {
    user: r.one.users({ from: r.notifications.userId, to: r.users.id }),
  },

  emailVerifications: {
    user: r.one.users({
      from: r.emailVerifications.userId,
      to: r.users.id,
    }),
  },

  // ═══════════════════════════════════════════════
  // GLOBAL ROLLER VE YETKİLER (1. KATMAN)
  // ═══════════════════════════════════════════════
  roles: {
    university: r.one.universities({
      from: r.roles.universityId,
      to: r.universities.id,
    }),
    permissions: r.many.permissions({
      from: r.roles.id.through(r.rolePermissions.roleId),
      to: r.permissions.id.through(r.rolePermissions.permissionId),
    }),
    users: r.many.users({
      from: r.roles.id.through(r.userRoles.roleId),
      to: r.users.id.through(r.userRoles.userId),
    }),
    rolePermissions: r.many.rolePermissions(),
  },
  permissions: {
    roles: r.many.roles({
      from: r.permissions.id.through(r.rolePermissions.permissionId),
      to: r.roles.id.through(r.rolePermissions.roleId),
    }),
    userPermissions: r.many.userPermissions(),
  },
  rolePermissions: {
    role: r.one.roles({ from: r.rolePermissions.roleId, to: r.roles.id }),
    permission: r.one.permissions({ from: r.rolePermissions.permissionId, to: r.permissions.id }),
  },
  userRoles: {
    user: r.one.users({ from: r.userRoles.userId, to: r.users.id }),
    role: r.one.roles({ from: r.userRoles.roleId, to: r.roles.id }),
  },
  userPermissions: {
    user: r.one.users({ from: r.userPermissions.userId, to: r.users.id }),
    permission: r.one.permissions({ from: r.userPermissions.permissionId, to: r.permissions.id }),
  },

  // ═══════════════════════════════════════════════
  // KULÜPLER (CLUBS - 2. KATMAN CLAIM)
  // ═══════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════
  // GALERİ VE DUYURULAR
  // ═══════════════════════════════════════════════
  clubGallery: {
    club: r.one.clubs({ from: r.clubGallery.clubId, to: r.clubs.id }),
    uploader: r.one.users({ from: r.clubGallery.uploadedBy, to: r.users.id }),
  },
  announcements: {
    university: r.one.universities({ from: r.announcements.universityId, to: r.universities.id }),
    club: r.one.clubs({ from: r.announcements.clubId, to: r.clubs.id }),
    author: r.one.users({ from: r.announcements.authorId, to: r.users.id }),
  },

  // ═══════════════════════════════════════════════
  // KULÜP BAŞVURULARI VE ONAY SÜRECİ
  // ═══════════════════════════════════════════════
  clubApplications: {
    university: r.one.universities({ from: r.clubApplications.universityId, to: r.universities.id }),
    applicant: r.one.users({ from: r.clubApplications.applicantId, to: r.users.id }),
    approvals: r.many.clubApplicationApprovals(),
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

  // ═══════════════════════════════════════════════
  // ETKİNLİKLER (ACTIVITIES)
  // ═══════════════════════════════════════════════
  activities: {
    // Oluşturan kişi (tekil FK) — users.createdActivities ile eşleşir.
    creator: r.one.users({
      from: r.activities.createdBy,
      to: r.users.id,
      alias: "creator_activity",
    }),
    // Katılan kullanıcılar (M:N) — users.attendingActivities ile eşleşir.
    attendees: r.many.users({
      from: r.activities.id.through(r.activityAttendees.userId),
      to: r.users.id.through(r.activityAttendees.activityId),
      alias: "attendee_activity",
    }),
    // Katılan kulüpler (M:N, host/co_host).
    clubs: r.many.clubs({
      from: r.activities.id.through(r.activityClubs.activityId),
      to: r.clubs.id.through(r.activityClubs.clubId),
    }),

    // Ara tablolara doğrudan erişim (rol/status/checkedInAt okumak için).
    activityClubs: r.many.activityClubs(),
    activityAttendees: r.many.activityAttendees(),
  },
  activityClubs: {
    activity: r.one.activities({ from: r.activityClubs.activityId, to: r.activities.id }),
    club: r.one.clubs({ from: r.activityClubs.clubId, to: r.clubs.id }),
  },
  activityAttendees: {
    activity: r.one.activities({ from: r.activityAttendees.activityId, to: r.activities.id }),
    user: r.one.users({ from: r.activityAttendees.userId, to: r.users.id }),
  },

  // ═══════════════════════════════════════════════
  // MEDYA (MEDIA)
  // ═══════════════════════════════════════════════
  media: {
    uploader: r.one.users({ from: r.media.uploaderId, to: r.users.id }),
    university: r.one.universities({ from: r.media.universityId, to: r.universities.id }),
  },
}));