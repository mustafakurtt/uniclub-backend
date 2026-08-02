/**
 * Admin facade — dışa açık `adminService` yüzeyi korunur; iç sorumluluklar
 * alt servislere bölündü. Çapraz-feature çağrıları bu dosyadan devam edebilir.
 */
import { adminDashboardService } from "./admin-dashboard.service";
import { adminUsersService } from "./admin-users.service";
import { clubApplicationReviewService } from "../clubs/club-application-review.service";
import { clubsService } from "../clubs/clubs.service";
import { clubsAdminService } from "../clubs/clubs-admin.service";

export const adminService = {
  ...adminDashboardService,
  ...adminUsersService,
  ...clubApplicationReviewService,
  listFormationProposals: clubsService.listFormationProposalsForAdmin,
  getFormationProposal: clubsService.getFormationProposalForAdmin,
  ...clubsAdminService,
};
