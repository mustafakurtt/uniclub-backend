import type { RelationHelpers } from "./types";

export const activitiesRelations = (r: RelationHelpers) => ({
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
});
