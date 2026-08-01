import { defineRelations } from "drizzle-orm";
import * as schema from "../schema";
import { universityRelations } from "./university";
import { usersRelations } from "./users";
import { rbacRelations } from "./rbac";
import { clubsRelations } from "./clubs";
import { announcementsRelations } from "./announcements";
import { notificationsRelations } from "./notifications";
import { applicationsRelations } from "./applications";
import { clubFormationRelations } from "./club-formation";
import { activitiesRelations } from "./activities";
import { mediaRelations } from "./media";
import { academicTermsRelations } from "./academic-terms";
import { membershipEventsRelations } from "./membership-events";
import { advisorInvitationsRelations } from "./advisor-invitations";
import { generalMeetingsRelations } from "./general-meetings";
import { approvalCommitteesRelations } from "./approval-committees";

export const relations = defineRelations(schema, (r) => ({
  ...universityRelations(r),
  ...usersRelations(r),
  ...rbacRelations(r),
  ...clubsRelations(r),
  ...announcementsRelations(r),
  ...notificationsRelations(r),
  ...applicationsRelations(r),
  ...clubFormationRelations(r),
  ...activitiesRelations(r),
  ...mediaRelations(r),
  ...academicTermsRelations(r),
  ...membershipEventsRelations(r),
  ...advisorInvitationsRelations(r),
  ...generalMeetingsRelations(r),
  ...approvalCommitteesRelations(r),
}));
