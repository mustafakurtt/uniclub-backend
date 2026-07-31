import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

/** Yerel migration klasörü — `src/db/migrations/<timestamp>_<name>/migration.sql`. */
export const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export type MigrationCheckResult =
  | { kind: "ok" }
  | { kind: "pending"; pending: string[] }
  | { kind: "unreachable" };

export type MigrationCheckLogger = {
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

/** Diskteki migration klasör adlarını (sıralı) döner. */
export function listLocalMigrationNames(migrationsDir = MIGRATIONS_DIR): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(migrationsDir, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

function isConnectionFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: string; message?: string };
  const code = e.code ?? e.errno;
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND") return true;
  const msg = e.message ?? "";
  return /connect|connection|refused|timeout/i.test(msg) && !/relation|schema|does not exist/i.test(msg);
}

/** `drizzle.__drizzle_migrations` yoksa veya şema yoksa true. */
function isMissingMigrationTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string };
  return e.code === "42P01" || e.code === "3F000";
}

/** Tek sorgu: uygulanmış migration adları. */
export async function fetchAppliedMigrationNames(databaseUrl: string): Promise<string[]> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const rows = await sql<{ name: string }[]>`SELECT name FROM drizzle.__drizzle_migrations`;
    return rows.map((row) => row.name);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/**
 * Yerel migration dosyalarını `drizzle.__drizzle_migrations` ile karşılaştırır.
 * Veritabanına bağlanılamazsa `{ kind: "unreachable" }` — açılış davranışı değişmez.
 */
export async function checkMigrationGap(
  databaseUrl: string,
  migrationsDir = MIGRATIONS_DIR
): Promise<MigrationCheckResult> {
  const local = listLocalMigrationNames(migrationsDir);
  let applied: string[];

  try {
    applied = await fetchAppliedMigrationNames(databaseUrl);
  } catch (err) {
    if (isConnectionFailure(err)) {
      return { kind: "unreachable" };
    }
    if (isMissingMigrationTable(err)) {
      return { kind: "pending", pending: local };
    }
    throw err;
  }

  const appliedSet = new Set(applied);
  const pending = local.filter((name) => !appliedSet.has(name));
  if (pending.length === 0) {
    return { kind: "ok" };
  }
  return { kind: "pending", pending };
}

/**
 * Açılışta migration açığını kontrol eder.
 * - production + pending → process.exit(1)
 * - diğer ortamlar + pending → belirgin uyarı, devam
 * - unreachable → sessiz (mevcut davranış)
 */
export async function ensureMigrationsAtStartup(options: {
  nodeEnv: string;
  databaseUrl: string;
  logger: MigrationCheckLogger;
  migrationsDir?: string;
}): Promise<void> {
  const result = await checkMigrationGap(options.databaseUrl, options.migrationsDir);

  if (result.kind === "unreachable" || result.kind === "ok") {
    return;
  }

  const { pending } = result;
  const payload = {
    pendingCount: pending.length,
    pendingMigrations: pending,
    fix: "bun run db:migrate",
  };

  if (options.nodeEnv === "production") {
    options.logger.error(
      payload,
      "Uygulanmamış migration'lar var — production açılışı durduruldu. Önce migration'ları uygulayın."
    );
    process.exit(1);
  }

  options.logger.warn(
    payload,
    "UYGULANMAMIŞ MIGRATION'LAR VAR — şema kod ile uyumsuz; ilk gerçek sorguda 500 alabilirsiniz. Çözüm: bun run db:migrate"
  );
}
