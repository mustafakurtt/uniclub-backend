/**
 * Activities facade — dışa açık `activitiesService` yüzeyi korunur; iç sorumluluklar
 * alt servislere bölündü. Route ve çapraz-feature çağrıları bu dosyadan devam eder.
 */
import { activitiesLifecycleService } from "./activities-lifecycle.service";
import { activitiesDiscoveryService } from "./activities-discovery.service";
import { activitiesRsvpService } from "./activities-rsvp.service";
import { activitiesCheckinService } from "./activities-checkin.service";
import { activitiesAdminService } from "./activities-admin.service";

export const activitiesService = {
  ...activitiesLifecycleService,
  ...activitiesDiscoveryService,
  ...activitiesRsvpService,
  ...activitiesCheckinService,
  ...activitiesAdminService,
};
