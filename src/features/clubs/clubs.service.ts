/**
 * Clubs facade — dışa açık `clubsService` yüzeyi korunur; iç sorumluluklar
 * alt servislere bölündü. Route ve çapraz-feature çağrıları bu dosyadan devam eder.
 */
import { clubsProfileService } from "./clubs-profile.service";
import { clubsMembershipService } from "./clubs-membership.service";
import { clubsFormationProposalsService } from "./clubs-formation-proposals.service";
import { clubsApplicationApplicantService } from "./clubs-application-applicant.service";

export const clubsService = {
  ...clubsProfileService,
  ...clubsMembershipService,
  ...clubsFormationProposalsService,
  ...clubsApplicationApplicantService,
};
