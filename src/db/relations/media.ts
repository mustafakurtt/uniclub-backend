import type { RelationHelpers } from "./types";

export const mediaRelations = (r: RelationHelpers) => ({
  media: {
    uploader: r.one.users({ from: r.media.uploaderId, to: r.users.id }),
    university: r.one.universities({ from: r.media.universityId, to: r.universities.id }),
  },
});
