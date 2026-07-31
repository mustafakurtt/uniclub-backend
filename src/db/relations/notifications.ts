import type { RelationHelpers } from "./types";

export const notificationsRelations = (r: RelationHelpers) => ({
  notifications: {
    user: r.one.users({ from: r.notifications.userId, to: r.users.id }),
  },
});
