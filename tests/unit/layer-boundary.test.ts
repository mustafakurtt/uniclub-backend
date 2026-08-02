import { describe, expect, it } from "bun:test";
import { Glob } from "bun";
import { relative, resolve } from "node:path";

/**
 * Katman sınırı — servis ve route dosyaları doğrudan db/schema kullanmaz.
 * Kural: yalnızca repository katmanı `db` ve `schema` import eder.
 */

const FEATURES_DIR = resolve(import.meta.dir, "../../src/features");
const SRC_DIR = resolve(import.meta.dir, "../../src");

const DB_IMPORT_RE = /from\s+["'](?:@\/db|(?:\.\.\/)+db)["']/g;
const DB_CALL_RE = /\b(?:db|tx)\.(?:query|select|insert|update|delete|transaction)\b/g;

describe("features katman sınırı (service / routes)", () => {
  it("service ve routes dosyaları db import etmez, db/tx üzerinden sorgu çağırmaz", async () => {
    const violations: string[] = [];

    for await (const file of new Glob("**/*.{service,routes}.ts").scan({
      cwd: FEATURES_DIR,
      absolute: true,
    })) {
      const source = await Bun.file(file).text();
      const relFile = relative(SRC_DIR, file).replace(/\\/g, "/");

      for (const [lineIndex, line] of source.split("\n").entries()) {
        for (const match of line.matchAll(DB_IMPORT_RE)) {
          violations.push(`${relFile}:${lineIndex + 1} → db import: ${match[0]}`);
        }
        for (const match of line.matchAll(DB_CALL_RE)) {
          violations.push(`${relFile}:${lineIndex + 1} → db çağrısı: ${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("tarayıcı gerçekten çalışıyor (test kendi kendini doğrular)", () => {
    const sample = `
      import { db } from "../../db";
      await db.query.users.findFirst({});
      await tx.insert(users).values({});
    `;
    expect(sample.match(DB_IMPORT_RE)?.length).toBe(1);
    expect(sample.match(DB_CALL_RE)?.map((m) => m)).toEqual([
      "db.query",
      "tx.insert",
    ]);
  });
});
