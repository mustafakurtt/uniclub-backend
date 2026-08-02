/**
 * Admin repository facade — geriye dönük uyumluluk için alt repository'lere delege eder.
 */
import { adminDashboardRepository } from "./admin-dashboard.repository";
import { adminUsersRepository } from "./admin-users.repository";
import { clubApplicationReviewRepository } from "../clubs/club-application-review.repository";
import { clubsAdminRepository } from "../clubs/clubs-admin.repository";

export const adminRepository = {
  ...adminDashboardRepository,
  ...adminUsersRepository,
  findClubApplicationsByUniversity: clubApplicationReviewRepository.findClubApplicationsByUniversity.bind(
    clubApplicationReviewRepository
  ),
  findClubApplicationInUniversity: clubApplicationReviewRepository.findClubApplicationInUniversity.bind(
    clubApplicationReviewRepository
  ),
  findClubApplicationDetail: clubApplicationReviewRepository.findClubApplicationDetail.bind(
    clubApplicationReviewRepository
  ),
  countClubApplicationRevisionRequests: clubApplicationReviewRepository.countClubApplicationRevisionRequests.bind(
    clubApplicationReviewRepository
  ),
  decideClubApplication: clubApplicationReviewRepository.decideClubApplication.bind(
    clubApplicationReviewRepository
  ),
  requestClubApplicationRevision: clubApplicationReviewRepository.requestClubApplicationRevision.bind(
    clubApplicationReviewRepository
  ),
  finalizeApplicationStepInTransaction: clubApplicationReviewRepository.finalizeApplicationStepInTransaction.bind(
    clubApplicationReviewRepository
  ),
  findClubApplicationEvents: clubApplicationReviewRepository.findApplicationEventsWithActor.bind(
    clubApplicationReviewRepository
  ),
  userHasRole: clubApplicationReviewRepository.userHasRole.bind(clubApplicationReviewRepository),
  ...clubsAdminRepository,
};
