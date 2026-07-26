/**
 * Yük testi koşucusu.
 *
 *   bun run perf              # sunucuyu kendi başlatır, koşar, kapatır
 *   PERF_BASE_URL=... bun run perf   # zaten koşan bir sunucuya vurur
 *
 * Senaryolar sistemin FARKLI KATMANLARINI ayırmak için seçildi; amaç tek bir
 * "RPS" sayısı değil, hangi katmanın ne kadar maliyet eklediğini görmek:
 *
 *   1. /health              → çıplak HTTP + Hono yönlendirme (taban çizgisi)
 *   2. üniversite listesi   → cache HIT yolu (DB'ye hiç gitmez)
 *   3. aramalı liste        → aynı sorgu ama cache DIŞI (DB'ye gider) → cache'in değeri
 *   4. kimlikli okuma       → JWT + attachAuthz (RBAC cache) + guard zinciri
 *   5. kulüp listesi        → tenant kapsamlı, kimlikli, cache'li gerçekçi okuma
 */
import { runScenario, waitForServer, printTable, type LoadResult, type Scenario } from "./load";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3100";
/** Virgülle birden çok değer verilebilir: PERF_CONNECTIONS=1,10,50,100 (süpürme). */
const CONNECTIONS = (process.env.PERF_CONNECTIONS ?? "50").split(",").map(Number);
const DURATION = Number(process.env.PERF_DURATION ?? 8);

/** Seed hesabı (bkz. src/db/seed.ts) — deterministik. */
const SEED_EMAIL = "elif.demir@antalya.edu.tr";
const SEED_PASSWORD = "Password123!";

async function login(): Promise<{ token: string; universityId: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok || typeof data.token !== "string") {
    throw new Error(`perf: giriş başarısız (${res.status}): ${JSON.stringify(data)}`);
  }

  const me = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { authorization: `Bearer ${data.token}` },
  });
  const meData = await me.json();
  return { token: data.token, universityId: meData.data.universityId };
}

function buildScenarios(auth: { token: string; universityId: string }): Scenario[] {
  const bearer = { headers: { authorization: `Bearer ${auth.token}` } };

  return [
    {
      name: "1. /health (taban çizgisi)",
      request: () => ({ url: `${BASE_URL}/health` }),
    },
    {
      name: "2. üniversite listesi (cache HIT)",
      request: () => ({ url: `${BASE_URL}/api/universities` }),
    },
    {
      /**
       * ⚠️ EŞZAMANLILIK=1'DE OKUYUN. Yüksek eşzamanlılıkta bu senaryo cache'i
       * KÖTÜ gösterir ama sebebi cache değildir: `getOrSet`in SINGLE-FLIGHT'ı,
       * aynı anahtara gelen N eşzamanlı miss'i TEK yüklemeye çökertir. Yani
       * "cache kapalı" koşusunda 50 istek ~1 DB sorgusuna iner ve cache'siz yol
       * yapay olarak hızlı görünür. Tek bağlantıda böyle bir çökme olmadığı için
       * cache'li/cache'siz karşılaştırma orada DÜRÜSTTÜR.
       */
      name: "2b. tek üniversite (cache HIT, id'li)",
      request: () => ({ url: `${BASE_URL}/api/universities/${auth.universityId}` }),
    },
    {
      // Arama BİLİNÇLİ olarak cache'lenmez (bkz. docs/cache/README.md §2.5) →
      // bu senaryo aynı veriyi her seferinde DB'den okur. 2 ile farkı = cache'in değeri.
      name: "3. aramalı liste (cache DIŞI, DB)",
      request: () => ({ url: `${BASE_URL}/api/universities?search=a` }),
    },
    {
      name: "4. kimlikli okuma (JWT + RBAC)",
      request: () => ({ url: `${BASE_URL}/api/auth/me`, init: bearer }),
    },
    {
      name: "5. kulüp listesi (kimlikli + cache)",
      request: () => ({ url: `${BASE_URL}/api/clubs`, init: bearer }),
    },
  ];
}

async function main() {
  console.log(`hedef       : ${BASE_URL}`);
  console.log(`eşzamanlılık: ${CONNECTIONS.join(", ")} · süre: ${DURATION} sn/senaryo\n`);

  await waitForServer(BASE_URL);
  const auth = await login();
  const scenarios = buildScenarios(auth);

  const results: LoadResult[] = [];
  for (const connections of CONNECTIONS) {
    for (const scenario of scenarios) {
      process.stdout.write(`koşuyor: [eşz=${connections}] ${scenario.name}`.padEnd(70) + "\r");
      results.push(await runScenario(scenario, { connections, durationSeconds: DURATION }));
    }
  }

  console.log(" ".repeat(70));
  printTable(results);

  const failed = results.filter((r) => r.errors > 0);
  if (failed.length > 0) {
    console.log(`\n⚠️  hatalı senaryolar: ${failed.map((f) => f.scenario).join(", ")}`);
  }
}

await main();
process.exit(0);
