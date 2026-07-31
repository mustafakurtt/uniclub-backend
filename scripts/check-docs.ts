#!/usr/bin/env bun
/**
 * Doküman bütünlük kontrolü — CI'da çalışır.
 * 1. docs altındaki ve kök .md dosyalarındaki relative markdown linkleri
 * 2. index.ts'teki app.route mount'ları ↔ docs/API.md bölümleri
 */
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, dirname, resolve, relative } from "path";

const ROOT = resolve(import.meta.dir, "..");
const DOCS = join(ROOT, "docs");
const API_MD = join(DOCS, "API.md");
const INDEX_TS = join(ROOT, "src", "index.ts");

let failed = false;

function fail(msg: string) {
  console.error(`✗ ${msg}`);
  failed = true;
}

function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

// ── 1. Markdown dosyalarını topla ───────────────────────────────────────────

function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectMarkdownFiles(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Alt router mount'larını taramak için tüm .ts kaynakları. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectSourceFiles(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

const markdownFiles = [
  ...collectMarkdownFiles(DOCS),
  ...readdirSync(ROOT)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(ROOT, f)),
];

// ── 2. Relative link kontrolü ───────────────────────────────────────────────

const linkRe = /\[([^\]]*)\]\(([^)#]+)(#[^)]*)?\)/g;
let linkCount = 0;
let brokenCount = 0;

for (const file of markdownFiles) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  let m: RegExpExecArray | null;
  linkRe.lastIndex = 0;

  while ((m = linkRe.exec(text))) {
    const target = m[2].trim();
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }

    linkCount++;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      brokenCount++;
      const lineNo =
        text.slice(0, m.index).split("\n").length;
      fail(
        `${relative(ROOT, file)}:${lineNo} → hedef yok: ${target} (çözümlenen: ${relative(ROOT, resolved)})`
      );
    }
  }
}

if (brokenCount === 0) {
  ok(`Relative linkler (${linkCount} adet) — kırık yok`);
} else {
  fail(`${brokenCount} kırık relative link`);
}

// ── 3. API.md kapsam kontrolü ───────────────────────────────────────────────

const indexSrc = readFileSync(INDEX_TS, "utf8");
const routeMounts = [...indexSrc.matchAll(/app\.route\("(\/api\/[^"]+)"/g)].map(
  (m) => m[1]
);

if (routeMounts.length === 0) {
  fail("src/index.ts içinde app.route('/api/...') bulunamadı");
}

/**
 * ALT MOUNT'LAR. Router'lar iç içe geçebilir: `index.ts` yalnızca `/api/clubs`ı
 * mount eder, `clubs.routes.ts` ise onun altına `/:clubId/announcements` ve
 * `/:clubId/gallery` ekler. API.md bu alt kaynakları ayrı bölüm olarak
 * belgelemekte HAKLIDIR — dolayısıyla "index.ts'te yok, demek ki fazladan"
 * çıkarımı yanlıştır. Alt yolları da toplayıp gerçekten var olup olmadığına
 * bakıyoruz.
 */
const subMounts = new Set(
  collectSourceFiles(join(ROOT, "src")).flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/\w+Routes\.route\("([^"]+)"/g)].map((m) => m[1])
  )
);

/** Belgelenen bir yol gerçek bir mount'a karşılık geliyor mu? */
function isMounted(path: string): boolean {
  if (routeMounts.includes(path)) return true;
  // Üst mount'un altına eklenmiş bir alt router olabilir.
  return routeMounts.some(
    (base) => path.startsWith(`${base}/`) && subMounts.has(path.slice(base.length))
  );
}

const apiMd = readFileSync(API_MD, "utf8");
const documentedMounts = [
  ...apiMd.matchAll(/### \d+\) .+ — `(\/api\/[^`]+)`/g),
].map((m) => m[1]);

const missingInApiMd = routeMounts.filter((r) => !documentedMounts.includes(r));
const extraInApiMd = documentedMounts.filter((r) => !isMounted(r));

if (missingInApiMd.length === 0 && extraInApiMd.length === 0) {
  ok(
    `API.md kapsamı — ${routeMounts.length} üst mount + ${documentedMounts.length - routeMounts.length} alt kaynak belgelenmiş`
  );
} else {
  for (const r of missingInApiMd) {
    fail(`API.md'de bölüm yok: app.route("${r}")`);
  }
  for (const r of extraInApiMd) {
    fail(`API.md'de var ama kodda böyle bir mount yok: ${r}`);
  }
}

// ── Sonuç ───────────────────────────────────────────────────────────────────

if (failed) {
  console.error("\nDoküman kontrolü BAŞARISIZ.");
  process.exit(1);
}

console.log("\nDoküman kontrolü geçti.");
process.exit(0);
