/**
 * tenant_settings cache invalidation — seed doğrudan DB'ye yazdığında stale bayrakları
 * önlemek için invalidateTenantSettingsCache kullanılır (bkz. src/db/seed.ts).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { login, me } from "./helpers";
import {
  invalidateTenantSettingsCache,
  getTenantSettings,
  setTenantSettingsCache,
} from "../src/features/tenant-settings/tenant-settings.cache";
import { buildDefaultResolvedSettings } from "../src/features/tenant-settings/tenant-settings.catalog";

describe("tenant settings cache", () => {
  let antalyaUni: string;

  beforeAll(async () => {
    const token = await login("sks@antalya.edu.tr");
    antalyaUni = (await me(token)).universityId as string;
  });

  it("invalidateTenantSettingsCache stale cache'i temizler, DB değerleri geri gelir", async () => {
    const defaults = buildDefaultResolvedSettings();
    await setTenantSettingsCache(antalyaUni, defaults);

    const stale = await getTenantSettings(antalyaUni);
    expect(stale.universityExportEnabled).toBe(false);

    await invalidateTenantSettingsCache(antalyaUni);
    const fresh = await getTenantSettings(antalyaUni);
    expect(fresh.universityExportEnabled).toBe(true);
  });
});
