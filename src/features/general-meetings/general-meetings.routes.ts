import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import {
  requireClubOfficer,
  requireClubStaff,
  requireClubMemberOrAdvisor,
  requireClubInTenant,
  ClubVariables,
} from "../../middlewares/club.middleware";
import { requireTenant } from "../../shared/utils/tenant.util";
import { validate } from "../../shared/utils/validate";
import { ok, created } from "../../shared/utils/respond";
import { generalMeetingsService } from "./general-meetings.service";
import { createGeneralMeetingSchema } from "./general-meetings.schema";

/**
 * Genel kurul kayıtları ve kurul üyeliği (T1.6 temel).
 */
export const generalMeetingsRoutes = new Hono<{ Variables: ClubVariables }>();

generalMeetingsRoutes.get(
  "/:clubId/current-board",
  authMiddleware,
  requireClubInTenant,
  requireClubMemberOrAdvisor,
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const board = await generalMeetingsService.getCurrentBoard(
      requireTenant(user.universityId),
      clubId
    );
    return ok(c, board, "generalMeeting.currentBoardListed");
  }
);

generalMeetingsRoutes.get(
  "/:clubId/general-meetings",
  authMiddleware,
  requireClubInTenant,
  requireClubStaff,
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const meetings = await generalMeetingsService.list(requireTenant(user.universityId), clubId);
    return ok(c, meetings, "generalMeeting.listed");
  }
);

generalMeetingsRoutes.get(
  "/:clubId/general-meetings/:meetingId",
  authMiddleware,
  requireClubInTenant,
  requireClubStaff,
  async (c) => {
    const user = c.get("user");
    const { clubId, meetingId } = c.req.param();
    const meeting = await generalMeetingsService.getById(
      requireTenant(user.universityId),
      clubId,
      meetingId
    );
    return ok(c, meeting, "generalMeeting.found");
  }
);

generalMeetingsRoutes.post(
  "/:clubId/general-meetings",
  authMiddleware,
  requireClubInTenant,
  requireClubOfficer,
  validate("json", createGeneralMeetingSchema),
  async (c) => {
    const user = c.get("user");
    const { clubId } = c.req.param();
    const body = c.req.valid("json");
    const meeting = await generalMeetingsService.create(
      requireTenant(user.universityId),
      clubId,
      user.userId,
      body
    );
    return created(c, meeting, "generalMeeting.created");
  }
);
