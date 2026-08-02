/** @deprecated Yeni kod doğrudan alt modül şemalarını import etmeli. */
export {
  listUsersQuerySchema,
  updateUserDepartmentSchema,
  type ListUsersQueryDTO,
  type UpdateUserDepartmentDTO,
} from "./admin-users.schema";

export {
  listClubApplicationsQuerySchema,
  rejectApplicationSchema,
  requestRevisionApplicationSchema,
  approveApplicationSchema,
  committeeVoteSchema,
  patchChecklistItemSchema,
  reviewAppealSchema,
  type ListClubApplicationsQueryDTO,
  type RejectApplicationDTO,
  type RequestRevisionApplicationDTO,
  type ApproveApplicationDTO,
  type CommitteeVoteDTO,
  type PatchChecklistItemDTO,
  type ReviewAppealDTO,
} from "../clubs/club-application-review.schema";

export {
  updateClubStatusSchema,
  listClubsQuerySchema,
  addAdvisorSchema,
  updateClubSchema,
  adminClubPaginatedListQuerySchema,
  listFormationProposalsQuerySchema,
  type UpdateClubStatusDTO,
  type ListClubsQueryDTO,
  type AddAdvisorDTO,
  type UpdateClubDTO,
  type AdminClubPaginatedListQueryDTO,
  type ListFormationProposalsQueryDTO,
} from "../clubs/clubs-admin.schema";
