/**
 * Testlerde Antalya tenant ayarlarını geçici değiştirme / seed değerine döndürme.
 */
import { db } from "../src/db";
import { approvalCommittees, tenantSettings } from "../src/db/schema";
import { TenantSettingKey } from "../src/features/tenant-settings/tenant-settings.catalog";
import { invalidateTenantSettingsCache } from "../src/features/tenant-settings/tenant-settings.cache";

export async function setTenantFormationThreshold(
  universityId: string,
  value: number,
  updatedBy: string
) {
  await db
    .insert(tenantSettings)
    .values({
      universityId,
      key: TenantSettingKey.CLUB_FORMATION_SUPPORT_THRESHOLD,
      value,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: [tenantSettings.universityId, tenantSettings.key],
      set: { value, updatedAt: new Date() },
    });
  await invalidateTenantSettingsCache(universityId);
}

export async function restoreAntalyaSeedFormationThreshold(universityId: string, updatedBy: string) {
  await setTenantFormationThreshold(universityId, 8, updatedBy);
}

export async function restoreAntalyaSeedApprovalChain(universityId: string, updatedBy: string) {
  const committee = await db.query.approvalCommittees.findFirst({
    where: { universityId, name: "Koordinasyon Kurulu" },
  });
  if (!committee) return;

  const chain = [{ type: "committee_majority", committeeId: committee.id }];
  await db
    .insert(tenantSettings)
    .values({
      universityId,
      key: TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN,
      value: chain,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: [tenantSettings.universityId, tenantSettings.key],
      set: { value: chain, updatedAt: new Date() },
    });
  await invalidateTenantSettingsCache(universityId);
}

export async function useClubApproverChainForTests(universityId: string, updatedBy: string) {
  const chain = ["club_approver"];
  await db
    .insert(tenantSettings)
    .values({
      universityId,
      key: TenantSettingKey.CLUB_APPLICATION_APPROVAL_CHAIN,
      value: chain,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: [tenantSettings.universityId, tenantSettings.key],
      set: { value: chain, updatedAt: new Date() },
    });
  await invalidateTenantSettingsCache(universityId);
}

export async function restoreKartekSeedFormationThreshold(universityId: string, updatedBy: string) {
  await setTenantFormationThreshold(universityId, 3, updatedBy);
}

export async function antalyaUniversityId() {
  const uni = await db.query.universities.findFirst({ where: { slug: "antalya-bilim" } });
  if (!uni) throw new Error("seed eksik: antalya-bilim");
  return uni.id;
}

export async function antalyaTechClubId() {
  const universityId = await antalyaUniversityId();
  const club = await db.query.clubs.findFirst({
    where: { slug: "yazilim-teknoloji", universityId },
  });
  if (!club) throw new Error("seed eksik: yazilim-teknoloji (Antalya)");
  return club.id;
}
