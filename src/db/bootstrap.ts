import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { hashPassword } from "../shared/utils/password.util";
import { provisionRbacCatalog } from "./rbac-catalog";

/**
 * PRODUCTION BOOTSTRAP — bir sistemin var olması için gereken MİNİMUM.
 *
 * seed'in (dev, sahte veriyle dolu) TERSİNE, bootstrap yalnızca:
 *   1. RBAC kataloğunu kurar (roller, yetkiler, demetler) — idempotent
 *   2. İlk `super_admin` hesabını oluşturur — yoksa
 *
 * Sahte üniversite/kulüp/kullanıcı ÜRETMEZ. Bu yüzden production'da çalışması
 * güvenlidir (NODE_ENV kontrolü yoktur) ve her deploy'da yeniden çağrılabilir:
 * var olanı bırakır, eksiği ekler.
 *
 * super_admin bilgileri ORTAM DEĞİŞKENİNDEN gelir (CLI scripti, app değil —
 * seed.ts / drizzle.config.ts ile aynı istisna, `env.ts`'e sokmuyoruz):
 *   SUPER_ADMIN_EMAIL       zorunlu (yoksa admin adımı atlanır, RBAC yine kurulur)
 *   SUPER_ADMIN_PASSWORD    zorunlu (en az 12 karakter)
 *   SUPER_ADMIN_FIRST_NAME  opsiyonel (varsayılan "Sistem")
 *   SUPER_ADMIN_LAST_NAME   opsiyonel (varsayılan "Yöneticisi")
 *
 * Şifre HİÇBİR ZAMAN log'a yazılmaz (deploy log'una sızmasın).
 *
 * Çalıştırma:  bun run db:bootstrap
 */

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME?.trim() || "Sistem";
  const lastName = process.env.SUPER_ADMIN_LAST_NAME?.trim() || "Yöneticisi";

  await db.transaction(async (tx) => {
    // ── 1. RBAC kataloğu (her zaman, idempotent) ──────────────
    const roleIdByName = await provisionRbacCatalog(tx);
    console.log("✓ RBAC kataloğu hazır (roller, yetkiler, demetler).");

    // ── 2. İlk super_admin ────────────────────────────────────
    if (!email || !password) {
      console.log("ℹ️  SUPER_ADMIN_EMAIL/PASSWORD verilmedi — süper yönetici oluşturma atlandı.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`SUPER_ADMIN_PASSWORD en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
    }

    // Platform hesabı: universityId IS NULL. Aynı e-postayla zaten varsa dokunma.
    const existing = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.universityId)))
      .limit(1);

    if (existing.length) {
      console.log(`ℹ️  super_admin zaten var: ${email} — dokunulmadı.`);
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await tx
      .insert(schema.users)
      .values({
        universityId: null, // platform hesabı — tenant scope'unu rolüyle bypass eder
        email,
        passwordHash,
        firstName,
        lastName,
        status: "active", // pending değil: doğrulama beklemeden iş yapabilmeli
      })
      .returning();

    await tx.insert(schema.userRoles).values({
      userId: user.id,
      roleId: roleIdByName["super_admin"],
    });

    console.log(`✓ super_admin oluşturuldu: ${email}`);
  });

  await db.$client.end();
}

main().catch(async (err) => {
  console.error("❌ Bootstrap başarısız:", err instanceof Error ? err.message : err);
  await db.$client.end().catch(() => {});
  process.exit(1);
});
