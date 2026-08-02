/**
 * Auth facade — dışa açık `authService` yüzeyi korunur; iç sorumluluklar
 * alt servislere bölündü. Route ve çapraz-feature çağrıları bu dosyadan devam eder.
 */
import { authRegistrationService } from "./auth-registration.service";
import { authProvisioningService } from "./auth-provisioning.service";
import { authTenantAdminInvitationService } from "./auth-tenant-admin-invitation.service";
import { authSessionService } from "./auth-session.service";
import { authRoleManagementService } from "./auth-role-management.service";

export type { RoleAdminActor } from "./auth-role-admin.policy";

export const authService = {
  ...authRegistrationService,
  ...authProvisioningService,
  ...authTenantAdminInvitationService,
  ...authSessionService,
  ...authRoleManagementService,
};
