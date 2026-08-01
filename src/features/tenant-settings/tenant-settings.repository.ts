import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { tenantSettings } from "../../db/schema";
import type { TenantSettingKey } from "./tenant-settings.catalog";

export type TenantSettingRow = typeof tenantSettings.$inferSelect;

class TenantSettingsRepository {
  async listOverrides(universityId: string): Promise<TenantSettingRow[]> {
    return db.select().from(tenantSettings).where(eq(tenantSettings.universityId, universityId));
  }

  async upsertOverride(
    universityId: string,
    key: TenantSettingKey,
    value: number | string[] | boolean,
    updatedBy: string
  ): Promise<void> {
    await db
      .insert(tenantSettings)
      .values({ universityId, key, value, updatedBy })
      .onConflictDoUpdate({
        target: [tenantSettings.universityId, tenantSettings.key],
        set: { value, updatedBy, updatedAt: new Date() },
      });
  }

  async deleteOverride(universityId: string, key: TenantSettingKey): Promise<void> {
    await db
      .delete(tenantSettings)
      .where(and(eq(tenantSettings.universityId, universityId), eq(tenantSettings.key, key)));
  }
}

export const tenantSettingsRepository = new TenantSettingsRepository();
