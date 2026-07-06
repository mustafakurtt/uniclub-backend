import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { redis } from "../shared/redis/redis.client";
import { AuthPermission } from "../features/auth/auth.permissions";
import { AdminPermission } from "../features/admin/admin.permissions";
import { ClubPermission, CLUB_PERMISSION_CATALOG } from "../features/clubs/clubs.permissions";
import { UNIVERSITY_PERMISSION_CATALOG } from "../features/university/university.permissions";
import { ANNOUNCEMENT_PERMISSION_CATALOG } from "../features/announcements/announcements.permissions";
import { GALLERY_PERMISSION_CATALOG } from "../features/gallery/gallery.permissions";
import { AuditPermission, AUDIT_PERMISSION_CATALOG } from "../features/audit/audit.permissions";

/**
 * Yetki kataloğu senkronizasyonu — VERİYİ SIFIRLAMADAN çalışır (db:reset'in aksine).
 *
 * Kod tarafındaki permission anahtarları (route guard'ları) ile veritabanındaki
 * permissions/rolePermissions tablolarını eşitler:
 *   1. Katalogda olup DB'de olmayan permission satırlarını ekler.
 *   2. admin / super_admin rollerine eksik atamaları ekler (fazla atamalara DOKUNMAZ —
 *      runtime'da role.manage üzerinden yapılmış bilinçli eklemeler korunur).
 *   3. Artık hiçbir route'un kullanmadığı eski anahtarları (club.manage,
 *      university.manage) rolePermissions/userPermissions bağlarıyla birlikte siler.
 *   4. Çekirdek rollerin `rank` (yetki derecesi) değerlerini backfill eder —
 *      kolon `default 0` ile eklendiği için mevcut bir DB'de TÜM roller 0 kalırdı;
 *      o durumda "kendinden düşük rütbe" kuralı (0 < 0 yanlış) herkesi kilitler.
 *   5. Redis'teki TÜM rbac cache'ini temizler — doğrudan DB değişikliği cache'i
 *      kendiliğinden düşürmez (5 dk TTL), bu adım olmadan eski yetkiler görünmeye
 *      devam eder.
 *
 * Bu senaryo, "club.manage → granüler club.*" gibi bir yeniden adlandırma sonrası
 * mevcut (seed edilmiş) bir dev/prod veritabanını güncellemek içindir.
 * Çalıştırma: bun run db:sync-permissions
 */

// Seed'dekiyle birebir aynı katalog — buradan saparsa seed ile sync birbirinden kayar.
const PERMISSION_CATALOG: { key: string; description: string }[] = [
  { key: AdminPermission.USER_MANAGE, description: "Kullanıcıları yönetme" },
  ...CLUB_PERMISSION_CATALOG,
  ...UNIVERSITY_PERMISSION_CATALOG,
  ...ANNOUNCEMENT_PERMISSION_CATALOG,
  ...GALLERY_PERMISSION_CATALOG,
  ...AUDIT_PERMISSION_CATALOG,
  { key: AuthPermission.ROLE_MANAGE, description: "Rol ve yetki kataloğu yönetimi" },
  { key: AuthPermission.PERMISSION_MANAGE, description: "Yetki tanımlama" },
];

// Eski isimlendirmeden kalan, artık hiçbir guard'ın referans vermediği anahtarlar.
const LEGACY_KEYS = ["club.manage", "university.manage"];

/**
 * Çekirdek global rollerin yetki derecesi — seed.ts `roleDefs` ile BİREBİR aynı
 * olmalıdır (saparsa hiyerarşi iki kaynak arasında kayar).
 */
const ROLE_RANKS: Record<string, number> = {
  student: 10,
  advisor: 20,
  auditor: 30,
  content_moderator: 30,
  student_affairs: 45,
  academic_affairs: 45,
  university_admin: 60,
  platform_support: 90,
  super_admin: 100,
};

// Global (universityId: null) rol adı → sahip olması GEREKEN anahtarlar (seed ile aynı).
const ROLE_GRANTS: Record<string, string[]> = {
  admin: [
    AdminPermission.USER_MANAGE,
    ClubPermission.APPROVE,
    ClubPermission.UPDATE,
    ClubPermission.ADVISOR_MANAGE,
    ClubPermission.DELETE,
  ],
  super_admin: PERMISSION_CATALOG.map((p) => p.key),
  // Denetim izi (audit.view): seed'deki ROLE_BUNDLES ile aynı — mevcut DB'lerin
  // db:reset olmadan yeni yetkiyi alabilmesi için buraya da işlenir.
  university_admin: [AuditPermission.VIEW],
  auditor: [AuditPermission.VIEW],
  platform_support: [AuditPermission.VIEW],
};

async function main() {
  console.log("🔄 Yetki kataloğu senkronizasyonu başlatılıyor...");

  await db.transaction(async (tx) => {
    // ═══════════════════════════════════════════════
    // 1. EKSİK PERMISSION SATIRLARINI EKLE
    // ═══════════════════════════════════════════════
    const existingPermissions = await tx.select().from(schema.permissions);
    const existingByKey = new Map(existingPermissions.map((p) => [p.key, p]));

    for (const item of PERMISSION_CATALOG) {
      const existing = existingByKey.get(item.key);
      if (!existing) {
        const [inserted] = await tx.insert(schema.permissions).values(item).returning();
        existingByKey.set(inserted.key, inserted);
        console.log(`  ➕ permission eklendi: ${item.key}`);
      } else if (existing.description !== item.description) {
        await tx
          .update(schema.permissions)
          .set({ description: item.description })
          .where(eq(schema.permissions.id, existing.id));
        console.log(`  ✏️ açıklama güncellendi: ${item.key}`);
      }
    }

    // ═══════════════════════════════════════════════
    // 2. ROL ATAMALARINDAKİ EKSİKLERİ TAMAMLA
    // ═══════════════════════════════════════════════
    for (const [roleName, grantKeys] of Object.entries(ROLE_GRANTS)) {
      const [role] = await tx
        .select()
        .from(schema.roles)
        .where(and(eq(schema.roles.name, roleName), isNull(schema.roles.universityId)));

      if (!role) {
        console.warn(`  ⚠️ Global '${roleName}' rolü bulunamadı — atlanıyor (seed çalıştırılmamış olabilir).`);
        continue;
      }

      const currentAssignments = await tx
        .select()
        .from(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, role.id));
      const currentPermissionIds = new Set(currentAssignments.map((rp) => rp.permissionId));

      for (const key of grantKeys) {
        const permission = existingByKey.get(key);
        if (!permission) {
          throw new Error(`Katalogda '${key}' anahtarı var ama DB'ye eklenememiş — beklenmeyen durum.`);
        }
        if (!currentPermissionIds.has(permission.id)) {
          await tx.insert(schema.rolePermissions).values({ roleId: role.id, permissionId: permission.id });
          console.log(`  🔗 '${roleName}' rolüne eklendi: ${key}`);
        }
      }
    }

    // ═══════════════════════════════════════════════
    // 3. ESKİ (LEGACY) ANAHTARLARI TEMİZLE
    // ═══════════════════════════════════════════════
    const legacyPermissions = existingPermissions.filter((p) => LEGACY_KEYS.includes(p.key));
    if (legacyPermissions.length > 0) {
      const legacyIds = legacyPermissions.map((p) => p.id);
      await tx.delete(schema.rolePermissions).where(inArray(schema.rolePermissions.permissionId, legacyIds));
      await tx.delete(schema.userPermissions).where(inArray(schema.userPermissions.permissionId, legacyIds));
      await tx.delete(schema.permissions).where(inArray(schema.permissions.id, legacyIds));
      for (const p of legacyPermissions) {
        console.log(`  🗑️ eski anahtar silindi: ${p.key}`);
      }
    }

    // ═══════════════════════════════════════════════
    // 4. ROL RÜTBELERİNİ (rank) BACKFILL ET
    // ═══════════════════════════════════════════════
    // `rank` kolonu `default 0` ile eklendiği için mevcut bir DB'de bütün roller
    // 0 olurdu; "kendinden düşük rütbe" kuralı (role.rank >= actor.maxRank → reddet)
    // o durumda 0 >= 0 olacağı için TÜM rol yönetimini kilitlerdi. Global şablon
    // rollerin (universityId IS NULL) rütbesini kanonik değerlere çekiyoruz.
    for (const [roleName, rank] of Object.entries(ROLE_RANKS)) {
      const [role] = await tx
        .select()
        .from(schema.roles)
        .where(and(eq(schema.roles.name, roleName), isNull(schema.roles.universityId)));

      if (!role) {
        console.warn(`  ⚠️ Global '${roleName}' rolü bulunamadı — rütbe atlanıyor.`);
        continue;
      }
      if (role.rank !== rank) {
        await tx.update(schema.roles).set({ rank }).where(eq(schema.roles.id, role.id));
        console.log(`  🎖️ '${roleName}' rütbesi ${role.rank} → ${rank}`);
      }
    }
  });

  // ═══════════════════════════════════════════════
  // 5. REDIS RBAC CACHE'İNİ TEMİZLE
  // ═══════════════════════════════════════════════
  // Doğrudan DB düzenlemesi cache invalidation tetiklemez; tüm kullanıcıların
  // etkin yetki cache'ini düşürüyoruz ki değişiklik anında görünür olsun.
  const cacheKeys = await redis.keys("rbac:permissions:*");
  if (cacheKeys.length > 0) {
    await redis.del(cacheKeys);
  }
  console.log(`🧹 Redis rbac cache temizlendi (${cacheKeys.length} anahtar).`);

  console.log("✅ Senkronizasyon tamamlandı.");
  await redis.quit();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Senkronizasyon sırasında hata oluştu:", err);
  process.exit(1);
});
