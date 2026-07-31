/**
 * Yük üreteci — bağımlılıksız, Bun'ın kendi `fetch`'iyle.
 *
 * TASARIM KARARI: sunucu AYRI BİR SÜREÇTE koşar ve buraya gerçek HTTP üzerinden
 * (loopback) vurulur. `app.request()` ile ölçmek çok daha kolay olurdu ama HTTP
 * sunucusunu, soket katmanını ve gerçek eşzamanlılığı atlardı — yani "sunucudaymış
 * gibi" olmazdı. Bu ayrım ölçümün anlamlı olmasının ön koşuludur.
 *
 * ÖLÇÜM DÜRÜSTLÜĞÜ:
 * - Isınma (warmup) ölçülmez: JIT, bağlantı havuzu ve cache dolumu ilk saniyelerde
 *   yanıltıcı sayılar üretir.
 *   - Gecikme ORTALAMASI değil YÜZDELİKLER raporlanır; ortalama, kuyruk gecikmesini
 *   (asıl önemli olan) gizler.
 * - Yük üretecinin kendisi de CPU harcar; aynı makinede koştuğu için yüksek
 *   eşzamanlılıkta ÜRETEÇ darboğaz olabilir. Sonuçlar mutlak kapasite değil,
 *   senaryolar arası KARŞILAŞTIRMA olarak okunmalıdır.
 */

export interface Scenario {
  name: string;
  /** Ölçülecek istek. Her çağrıda yeniden üretilir (gövde/hedef değişebilsin). */
  request: () => { url: string; init?: RequestInit };
  /** Beklenen HTTP durumu; farklıysa hata sayılır. Varsayılan 200. */
  expectStatus?: number;
}

export interface LoadOptions {
  /** Eşzamanlı sanal kullanıcı sayısı. */
  connections: number;
  /** Ölçüm süresi (sn). */
  durationSeconds: number;
  /** Ölçüm dışı ısınma süresi (sn). Varsayılan 2. */
  warmupSeconds?: number;
}

export interface LoadResult {
  scenario: string;
  connections: number;
  requests: number;
  errors: number;
  rps: number;
  /** Gecikme yüzdelikleri (ms). */
  p50: number;
  p90: number;
  p99: number;
  max: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Tek bir senaryoyu verilen eşzamanlılıkta koşturur. */
export async function runScenario(scenario: Scenario, options: LoadOptions): Promise<LoadResult> {
  const expectStatus = scenario.expectStatus ?? 200;
  const warmupMs = (options.warmupSeconds ?? 2) * 1000;
  const durationMs = options.durationSeconds * 1000;

  const latencies: number[] = [];
  let errors = 0;
  let measuring = false;

  const deadline = Date.now() + warmupMs + durationMs;
  const measureFrom = Date.now() + warmupMs;

  async function worker() {
    while (Date.now() < deadline) {
      // Isınma bittiği anda ölçüme geç (bir kez).
      if (!measuring && Date.now() >= measureFrom) measuring = true;

      const { url, init } = scenario.request();
      const startedAt = performance.now();
      try {
        const res = await fetch(url, init);
        // Gövde TÜKETİLMELİ: okunmayan gövde bağlantıyı serbest bırakmaz ve
        // ölçümü sessizce bozar (sonraki istekler yeni bağlantı açmak zorunda kalır).
        await res.arrayBuffer();
        const elapsed = performance.now() - startedAt;

        if (Date.now() >= measureFrom) {
          if (res.status !== expectStatus) errors++;
          else latencies.push(elapsed);
        }
      } catch {
        if (Date.now() >= measureFrom) errors++;
      }
    }
  }

  await Promise.all(Array.from({ length: options.connections }, worker));

  latencies.sort((a, b) => a - b);
  return {
    scenario: scenario.name,
    connections: options.connections,
    requests: latencies.length + errors,
    errors,
    rps: round((latencies.length + errors) / options.durationSeconds),
    p50: round(percentile(latencies, 50)),
    p90: round(percentile(latencies, 90)),
    p99: round(percentile(latencies, 99)),
    max: round(latencies[latencies.length - 1] ?? 0),
  };
}

/** Sunucunun ayağa kalkmasını bekler (en fazla `timeoutMs`). */
export async function waitForServer(baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // henüz kalkmadı
    }
    await Bun.sleep(250);
  }
  throw new Error(`sunucu ${timeoutMs} ms içinde ayağa kalkmadı: ${baseUrl}`);
}

export function printTable(results: LoadResult[]): void {
  const header = ["senaryo", "eşz.", "istek", "hata", "RPS", "p50", "p90", "p99", "max"];
  const rows = results.map((r) => [
    r.scenario,
    String(r.connections),
    String(r.requests),
    String(r.errors),
    String(r.rps),
    `${r.p50}ms`,
    `${r.p90}ms`,
    `${r.p99}ms`,
    `${r.max}ms`,
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");

  console.log(line(header));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
}
