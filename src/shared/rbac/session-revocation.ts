import { closeConnectionsForUser } from "../../features/notifications/notifications.gateway";
import { invalidateUserPermissions } from "./rbac.cache";

/**
 * Oturum iptali yan etkileri: authz cache düşür + bu instance'daki WS bağlantılarını kapat.
 * Yalnızca gerçek iptal olaylarında çağrılır (şifre bump sonrası, askıya alma).
 * Rol/izin değişimi `invalidateUserPermissions` kullanır — WS kopmaz.
 */
export const revokeUserSessions = async (userId: string): Promise<void> => {
  await invalidateUserPermissions(userId);
  closeConnectionsForUser(userId);
};
