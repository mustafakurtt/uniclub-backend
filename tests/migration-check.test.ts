import { afterAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import {
  checkMigrationGap,
  ensureMigrationsAtStartup,
  listLocalMigrationNames,
} from "../src/db/migration-check";
import { TEST_DATABASE_URL } from "./config";

const sql = postgres(TEST_DATABASE_URL, { max: 1 });

type MigrationRow = {
  hash: string;
  created_at: string;
  name: string;
};

async function deleteMigrationRow(name: string): Promise<MigrationRow> {
  const rows = await sql<MigrationRow[]>`SELECT hash, created_at, name FROM drizzle.__drizzle_migrations WHERE name = ${name}`;
  const row = rows[0];
  if (!row) throw new Error(`migration kaydı yok: ${name}`);
  await sql`DELETE FROM drizzle.__drizzle_migrations WHERE name = ${name}`;
  return row;
}

async function restoreMigrationRow(row: MigrationRow): Promise<void> {
  await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at, name) VALUES (${row.hash}, ${row.created_at}, ${row.name})`;
}

describe("migration-check — yerel liste", () => {
  it("migration.sql içeren klasör adlarını sıralı döner", () => {
    const names = listLocalMigrationNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort());
    for (const name of names) {
      expect(name).toMatch(/^\d{14}_/);
    }
  });
});

describe("migration-check — gap tespiti", () => {
  it("tam uygulanmış veritabanında pending yok", async () => {
    const result = await checkMigrationGap(TEST_DATABASE_URL);
    expect(result.kind).toBe("ok");
  });

  it("eksik migration kaydında pending listeler", async () => {
    const local = listLocalMigrationNames();
    const target = local[local.length - 1]!;
    const saved = await deleteMigrationRow(target);

    const result = await checkMigrationGap(TEST_DATABASE_URL);
    expect(result.kind).toBe("pending");
    if (result.kind === "pending") {
      expect(result.pending).toContain(target);
    }

    await restoreMigrationRow(saved);
  });
});

describe("migration-check — production açılışı", () => {
  it("eksik migration varsa production modunda process.exit(1) çağırır", async () => {
    const local = listLocalMigrationNames();
    const target = local[local.length - 1]!;
    const saved = await deleteMigrationRow(target);

    const proc = Bun.spawn(
      [
        "bun",
        "-e",
        `import { ensureMigrationsAtStartup } from "./src/db/migration-check.ts";
         await ensureMigrationsAtStartup({
           nodeEnv: "production",
           databaseUrl: process.env.DATABASE_URL!,
           logger: { warn: () => {}, error: () => {} },
         });`,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production",
          DATABASE_URL: TEST_DATABASE_URL,
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const code = await proc.exited;
    expect(code).toBe(1);

    await restoreMigrationRow(saved);
  });

  it("development modunda eksik migration ile çıkmaz", async () => {
    const local = listLocalMigrationNames();
    const target = local[local.length - 1]!;
    const saved = await deleteMigrationRow(target);

    let warned = false;
    await ensureMigrationsAtStartup({
      nodeEnv: "development",
      databaseUrl: TEST_DATABASE_URL,
      logger: {
        warn: () => {
          warned = true;
        },
        error: () => {},
      },
    });

    expect(warned).toBe(true);

    await restoreMigrationRow(saved);
  });
});

afterAll(async () => {
  await sql.end();
});
