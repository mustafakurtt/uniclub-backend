import { describe, expect, it } from "bun:test";
import { Glob } from "bun";
import { dirname, join, relative, resolve } from "node:path";

/**
 * SINIR TESTİ — core/'un taşınabilirliğini KORUYAN mekanizma.
 *
 * `src/core` proje-bağımsız olmakla değerli: başka bir Bun/Hono projesine olduğu
 * gibi kopyalanabilmeli. Bu bugün doğru, ama bunu koruyan hiçbir şey yoktu —
 * yarın biri core'a `import { env } from "../config/env"` yazsa sessizce geçerdi
 * ve çatı kullanılamaz hale gelirdi. Bu test o düzeni kalıcılaştırır.
 *
 * Kural: core/ YALNIZCA kendi içine ve dış paketlere (hono, zod, ioredis...)
 * bağımlı olabilir; `shared/`, `config/`, `features/`, `middlewares/`, `db/`'ye ASLA.
 */

const CORE_DIR = resolve(import.meta.dir, "../../src/core");
const SRC_DIR = resolve(import.meta.dir, "../../src");

/** Bir dosyadaki tüm relatif import/export kaynaklarını çıkarır. */
function relativeImports(source: string): string[] {
  const specifiers: string[] = [];
  // import ... from "x" | export ... from "x" | import("x")
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.[^"']*)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

const FORBIDDEN = ["shared", "config", "features", "middlewares", "db"];

describe("core/ taşınabilirlik sınırı", () => {
  it("core/ dışarıya (shared, config, features, middlewares, db) import ETMEZ", async () => {
    const violations: string[] = [];

    for await (const file of new Glob("**/*.ts").scan({ cwd: CORE_DIR, absolute: true })) {
      const source = await Bun.file(file).text();

      for (const specifier of relativeImports(source)) {
        // Import'u mutlak yola çevir: core'dan çıkıyor mu, çıkıyorsa nereye?
        const target = resolve(dirname(file), specifier);
        if (target.startsWith(CORE_DIR)) continue; // core içi → serbest

        const fromSrc = relative(SRC_DIR, target).split(/[\\/]/)[0];
        if (FORBIDDEN.includes(fromSrc)) {
          violations.push(`${relative(SRC_DIR, file)} → ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("core/ `process.env`'i doğrudan OKUMAZ (env projede, dikişle enjekte edilir)", async () => {
    const violations: string[] = [];

    for await (const file of new Glob("**/*.ts").scan({ cwd: CORE_DIR, absolute: true })) {
      const source = await Bun.file(file).text();
      // İstisna: core/config/env.ts'in görevi process.env'i OKUMAK (varsayılan source).
      if (relative(CORE_DIR, file).replace(/\\/g, "/") === "config/env.ts") continue;

      // Yorum satırlarını ele — "env core'a girmez" gibi açıklamalar yakalanmasın.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

      if (code.includes("process.env")) violations.push(relative(SRC_DIR, file));
    }

    expect(violations).toEqual([]);
  });

  it("sınır tarayıcısı gerçekten çalışıyor (test kendi kendini doğrular)", () => {
    // Tarayıcı bozulup her zaman boş dönerse testler sessizce yeşil kalırdı.
    const source = `
      import { env } from "../config/env";
      import { Cache } from "./cache";
      export { x } from "../../shared/logger/logger";
      const m = await import("../db/schema");
    `;
    expect(relativeImports(source)).toEqual([
      "../config/env",
      "./cache",
      "../../shared/logger/logger",
      "../db/schema",
    ]);
  });
});
