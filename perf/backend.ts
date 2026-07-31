import { redis } from "../src/shared/redis/redis.client";
import { universityRepository } from "../src/features/university/repositories";

async function measure(label: string, fn: () => Promise<unknown>, n: number, concurrency: number) {
  await fn();
  const lat: number[] = [];
  const t0 = performance.now();
  const perWorker = Math.ceil(n / concurrency);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let i = 0; i < perWorker; i++) {
      const t = performance.now();
      await fn();
      lat.push(performance.now() - t);
    }
  }));
  const total = performance.now() - t0;
  lat.sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length * 0.5)];
  console.log(`${label.padEnd(34)} eşz=${String(concurrency).padStart(3)}  p50=${p50.toFixed(3)}ms  ops/sn=${Math.round(lat.length / (total / 1000))}`);
}

await redis.set("perf:rtt", JSON.stringify({ a: 1 }));

console.log("=== TEK BAĞLANTI / SIRALI ===");
await measure("redis GET", () => redis.get("perf:rtt"), 2000, 1);
await measure("postgres SELECT (uni listesi)", () => universityRepository.list(), 2000, 1);

console.log("\n=== 50 EŞZAMANLI (yük testindeki gibi) ===");
await measure("redis GET", () => redis.get("perf:rtt"), 20000, 50);
await measure("postgres SELECT (uni listesi)", () => universityRepository.list(), 20000, 50);
process.exit(0);
