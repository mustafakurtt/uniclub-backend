#!/usr/bin/env bun
/**
 * Doküman bütünlük kontrolü — CI'da çalışır.
 * 1. docs altındaki ve kök .md dosyalarındaki relative markdown linkleri
 * 2. index.ts'teki app.route mount'ları ↔ docs/reference/api.md bölümleri
 */
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, dirname, resolve, relative } from "path";
import {
  SELF_SERVICE_PASSWORD_MIN_LENGTH,
  PROVISION_PASSWORD_MIN_LENGTH,
} from "../src/shared/schemas/password.schema";
import {
  findExpiredReleaseFlags,
  findReleaseFlagsMissingSunset,
} from "../src/features/tenant-settings/tenant-settings.release-check";

const ROOT = resolve(import.meta.dir, "..");
const DOCS = join(ROOT, "docs");
const API_MD = join(DOCS, "reference", "api.md");
const SURFACE_COVERAGE_MD = join(DOCS, "reference", "api-surface-coverage.md");
const SURFACE_BASELINE_JSON = join(DOCS, "reference", "api-surface-baseline.json");
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

// ── 3. reference/api.md kapsam kontrolü ─────────────────────────────────────

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
    `reference/api.md kapsamı — ${routeMounts.length} üst mount + ${documentedMounts.length - routeMounts.length} alt kaynak belgelenmiş`
  );
} else {
  for (const r of missingInApiMd) {
    fail(`reference/api.md'de bölüm yok: app.route("${r}")`);
  }
  for (const r of extraInApiMd) {
    fail(`reference/api.md'de var ama kodda böyle bir mount yok: ${r}`);
  }
}

// ── 4. reference/api.md içindekiler ↔ bölüm numaralandırması ───────────────

const sectionHeaders = [...apiMd.matchAll(/^### (\d+)\) .+ — `(\/api\/[^`]+)`/gm)].map((m) => ({
  num: Number(m[1]),
  path: m[2],
}));

if (sectionHeaders.length === 0) {
  fail("reference/api.md içinde `### N) ... — `/api/...`` bölüm başlığı bulunamadı");
} else {
  const nums = sectionHeaders.map((h) => h.num);
  const expected = Array.from({ length: nums.length }, (_, i) => i + 1);
  const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
  const missingSeq = expected.filter((n) => !nums.includes(n));
  const extraSeq = nums.filter((n) => n < 1 || n > nums.length);

  if (dupes.length > 0) {
    fail(`reference/api.md bölüm numaraları çakışıyor: ${[...new Set(dupes)].join(", ")}`);
  } else if (missingSeq.length > 0 || extraSeq.length > 0) {
    fail(
      `reference/api.md bölüm numaralandırması kırık — beklenen 1..${nums.length}, bulunan: ${nums.join(", ")}`
    );
  } else {
    ok(`reference/api.md bölüm numaralandırması — ${nums.length} bölüm, 1..${nums.length} ardışık`);
  }
}

// İçindekiler TOC satırları ↔ bölüm anchor'ları (Notifications'tan itibaren kayma yakalanır)
const tocSectionLinks = [...apiMd.matchAll(/^\s+- \[.+?\]\(#(\d+)-[^)]+\)/gm)].map((m) => Number(m[1]));
const tocNums = tocSectionLinks.filter((n) => n >= 1);
if (tocNums.length > 0) {
  const tocDupes = tocNums.filter((n, i) => tocNums.indexOf(n) !== i);
  const tocExpected = Array.from({ length: tocNums.length }, (_, i) => i + 1);
  const tocBroken =
    tocDupes.length > 0 ||
    tocExpected.some((n) => !tocNums.includes(n)) ||
    tocNums.some((n) => n < 1 || n > tocNums.length);

  if (tocBroken) {
    fail(`reference/api.md İçindekiler numaralandırması kırık: ${tocNums.join(", ")}`);
  } else {
    ok(`reference/api.md İçindekiler — ${tocNums.length} endpoint bölümü, anchor numaraları ardışık`);
  }
}

// ── 5. Bilinen ölü path referansları ────────────────────────────────────────

const DEAD_PATH_PATTERNS = [
  /docs\/yonetim\//,
  /GOREV_PANOSU\.md/,
  /docs\/frontend\//,
  /docs\/API\.md/,
  /docs\/DATA_MODEL\.md/,
  /docs\/KVKK\.md/,
  /docs\/LOGLAMA\.md/,
  /docs\/MAKINE_KURULUMU\.md/,
  /docs\/operations\.md/,
  /docs\/architecture\.md/,
  /docs\/CORE_MIDDLEWARE\.md/,
  /docs\/GUVENLIK_YOL_HARITASI\.md/,
  /docs\/SEMA_VE_URUN_YOL_HARITASI\.md/,
  /docs\/ONBOARDING_TENANT\.md/,
  /docs\/PERFORMANS\.md/,
  /docs\/MAIL_DOGRULAMA\.md/,
  /docs\/BILDIRIMLER\.md/,
  /docs\/DENETIM_VE_HATA\.md/,
  /docs\/cache\//,
  /design\/05-eksikler-ve-onerilen-endpointler\.md/,
];
const scanExts = [".md", ".ts", ".yml"];
let deadRefCount = 0;

function scanDeadPaths(dir: string) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      // .claude-notlar: kişisel çalışma notlarının yedeği — proje dokümanı
      // değil, tarihsel kayıt tutar (eski path'lere atıf yapması normaldir).
      if (
        entry === "node_modules" ||
        entry === ".git" ||
        entry === "src/db/migrations" ||
        entry === ".claude-notlar"
      )
        continue;
      scanDeadPaths(p);
    } else if (scanExts.some((ext) => entry.endsWith(ext))) {
      if (relative(ROOT, p) === "scripts/update-doc-links.ts") continue;
      if (relative(ROOT, p) === "scripts/patch-auth-doc.ts") continue;
      const text = readFileSync(p, "utf8");
      for (const pat of DEAD_PATH_PATTERNS) {
        if (pat.test(text)) {
          deadRefCount++;
          fail(`${relative(ROOT, p)} → ölü path referansı: ${pat}`);
        }
      }
    }
  }
}

scanDeadPaths(ROOT);

if (deadRefCount === 0) {
  ok("Ölü docs path referansı yok");
}

// ── 5. Şifre minimum uzunlukları — docs/ genelinde yanlış değer taraması ───

const ALLOWED_PASSWORD_MIN_LENGTHS = new Set([
  SELF_SERVICE_PASSWORD_MIN_LENGTH,
  PROVISION_PASSWORD_MIN_LENGTH,
]);

/** Şifre bağlamı: satırda password/şifre geçiyorsa minimum uzunluk ifadesi denetlenir. */
const PASSWORD_CONTEXT_RE = /password|şifre|newPassword|currentPassword/i;
const PASSWORD_MIN_PATTERNS = [
  /\bmin(?:imum)?\s+(\d+)/gi,
  /\ben az\s+(\d+)\s*karakter/gi,
  /\(\s*min\s+(\d+)\s*\)/gi,
];

let passwordMinViolationCount = 0;

for (const file of collectMarkdownFiles(DOCS)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!PASSWORD_CONTEXT_RE.test(line)) continue;

    for (const pattern of PASSWORD_MIN_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line))) {
        const value = Number(match[1]);
        if (!ALLOWED_PASSWORD_MIN_LENGTHS.has(value)) {
          passwordMinViolationCount++;
          const rel = relative(ROOT, file);
          fail(
            `${rel}:${lineIndex + 1} şifre minimumu ${value} — yalnızca ${SELF_SERVICE_PASSWORD_MIN_LENGTH} (self-service) veya ${PROVISION_PASSWORD_MIN_LENGTH} (provision) kabul edilir: ${line.trim()}`
          );
        }
      }
    }
  }
}

if (passwordMinViolationCount === 0) {
  ok(
    `docs/ şifre minimum uzunlukları (${SELF_SERVICE_PASSWORD_MIN_LENGTH}/${PROVISION_PASSWORD_MIN_LENGTH}) ile uyumlu`
  );
}

// ── 6. Özellik bayrağı release sunset — geçmiş tarih CI'ı kırar ─────────────

const missingSunset = findReleaseFlagsMissingSunset();
for (const key of missingSunset) {
  fail(`release bayrağı sunsetAfter eksik: ${key}`);
}
if (missingSunset.length === 0) {
  ok("release bayrakları sunsetAfter tanımlı");
}

const expiredReleaseFlags = findExpiredReleaseFlags();
for (const { key, sunsetAfter } of expiredReleaseFlags) {
  fail(`release bayrağı sunsetAfter geçmiş: ${key} (${sunsetAfter})`);
}
if (expiredReleaseFlags.length === 0) {
  ok("süresi dolmuş release bayrağı yok");
}

// ── 7. API yüzey kapsaması — boş yüzey yasak; (eksik) mandal ───────────────

const surfaceMd = readFileSync(SURFACE_COVERAGE_MD, "utf8");
const surfaceRowRe =
  /^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \| (.+?) \|$/gm;

function surfaceKey(method: string, path: string): string {
  return `${method} ${path}`;
}

let surfaceRowCount = 0;
let emptySurfaceCount = 0;
let invalidSurfaceCount = 0;
let bareDashSurfaceCount = 0;
const currentEksik = new Set<string>();
const surfaceRows = new Map<string, string>();

function isValidSurface(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("(eksik)")) return true;
  if (trimmed.startsWith("(karar bekliyor)")) return true;
  if (trimmed.startsWith("(dolaylı)")) return true;
  if (trimmed.startsWith("(iç)")) return true;
  if (trimmed.startsWith("(dahili)")) return true;
  return trimmed.includes("/");
}

let surfaceMatch: RegExpExecArray | null;
surfaceRowRe.lastIndex = 0;
while ((surfaceMatch = surfaceRowRe.exec(surfaceMd))) {
  surfaceRowCount++;
  const method = surfaceMatch[1];
  const path = surfaceMatch[2];
  const surface = surfaceMatch[3].trim();
  const key = surfaceKey(method, path);
  surfaceRows.set(key, surface);

  if (!surface) {
    emptySurfaceCount++;
    fail(
      `api-surface-coverage.md: boş yüzey — ${method} ${path}`
    );
  } else if (surface === "—") {
    bareDashSurfaceCount++;
    fail(
      `api-surface-coverage.md: ham "—" yüzey — ${method} ${path} ((eksik), (dolaylı) veya (iç) kullanın)`
    );
  } else if (surface.startsWith("(eksik)")) {
    currentEksik.add(key);
  } else if (!isValidSurface(surface)) {
    invalidSurfaceCount++;
    fail(
      `api-surface-coverage.md: geçersiz yüzey "${surface}" — ${method} ${path} (rota, (eksik), (karar bekliyor), (dolaylı), (iç) veya (dahili) gerekli)`
    );
  }
}

if (surfaceRowCount === 0) {
  fail("api-surface-coverage.md içinde yüzey tablosu satırı bulunamadı");
}

// Mandal: bilinen (eksik) borç api-surface-baseline.json ile sabitlenir
type BaselineFile = {
  eksik?: Array<{ method: string; path: string }>;
};

let baselineEksik = new Set<string>();
if (!existsSync(SURFACE_BASELINE_JSON)) {
  fail("api-surface-baseline.json bulunamadı — bilinen (eksik) borç tabanı gerekli");
} else {
  const baselineRaw = JSON.parse(readFileSync(SURFACE_BASELINE_JSON, "utf8")) as BaselineFile;
  const entries = baselineRaw.eksik ?? [];
  if (!Array.isArray(entries) || entries.length === 0) {
    fail("api-surface-baseline.json: eksik dizisi boş veya yok");
  } else {
    for (const entry of entries) {
      if (!entry.method || !entry.path) {
        fail("api-surface-baseline.json: her kayıtta method ve path gerekli");
        continue;
      }
      baselineEksik.add(surfaceKey(entry.method, entry.path));
    }
  }
}

const newEksikDebt = [...currentEksik].filter((k) => !baselineEksik.has(k));
for (const key of newEksikDebt) {
  fail(
    `api-surface-coverage.md: yeni (eksik) borç — ${key} (yüzeyi bağlayın veya api-surface-baseline.json'a gerekçeyle ekleyin)`
  );
}

const baselineOnly = [...baselineEksik].filter((k) => !currentEksik.has(k));
const debtReduced: string[] = [];
const baselineBloat: string[] = [];

for (const key of baselineOnly) {
  const surface = surfaceRows.get(key);
  if (surface && !surface.startsWith("(eksik)")) {
    debtReduced.push(key);
  } else {
    baselineBloat.push(key);
  }
}

if (debtReduced.length > 0) {
  fail(
    `api-surface-baseline.json: borç azaldı — tabanı güncelleyin (şu satırları çıkarın): ${debtReduced.join(", ")}`
  );
}

for (const key of baselineBloat) {
  fail(
    `api-surface-baseline.json: taban büyüdü veya geçersiz kayıt — ${key} (tabloda (eksik) değil; tabandan çıkarın)`
  );
}

if (
  surfaceRowCount > 0 &&
  emptySurfaceCount === 0 &&
  bareDashSurfaceCount === 0 &&
  invalidSurfaceCount === 0 &&
  newEksikDebt.length === 0 &&
  debtReduced.length === 0 &&
  baselineBloat.length === 0
) {
  ok(
    `api-surface-coverage.md yüzey sütunu — ${surfaceRowCount} uç, ${currentEksik.size} bilinen (eksik) mandalda`
  );
}

// ── Sonuç ───────────────────────────────────────────────────────────────────

if (failed) {
  console.error("\nDoküman kontrolü BAŞARISIZ.");
  process.exit(1);
}

console.log("\nDoküman kontrolü geçti.");
process.exit(0);
