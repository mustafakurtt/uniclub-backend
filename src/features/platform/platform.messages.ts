import { mergeCatalogs } from "../../core/i18n/translator";
import { tenantsMessages, type TenantsMessageKey } from "./tenants/tenants.messages";
import { operatorUsersMessages, type OperatorUsersMessageKey } from "./operator-users/operator-users.messages";

/**
 * platform feature i18n kompozisyonu — alt modül katalogları burada birleşir.
 */
export const platformMessages = mergeCatalogs(tenantsMessages, operatorUsersMessages);

export type PlatformMessageKey = TenantsMessageKey | OperatorUsersMessageKey;
