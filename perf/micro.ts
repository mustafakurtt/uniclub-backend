import { jsonCodec, richCodec, Cache, InMemoryCacheStore, TimeoutCacheStore, CircuitBreakerCacheStore } from "../src/core/cache";
import { createLogger } from "../src/core/logger/logger";

// Üniversite listesi cevabının gerçekçi bir kopyası (3 satır, Date alanlı).
const payload = Array.from({ length: 3 }, (_, i) => ({
  id: `11111111-2222-3333-4444-55555555555${i}`,
  name: `Üniversite ${i}`, slug: `uni-${i}`, createdAt: new Date(),
}));

function bench(label: string, fn: () => void, iterations = 50_000) {
  fn(); // ısınma
  const t = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = performance.now() - t;
  console.log(`${label.padEnd(38)} ${(ms * 1000 / iterations).toFixed(2)} µs/işlem`);
}

const jsonEncoded = jsonCodec.encode(payload);
const richEncoded = richCodec.encode(payload);
console.log("=== CODEC ===");
bench("jsonCodec.encode", () => jsonCodec.encode(payload));
bench("richCodec.encode", () => richCodec.encode(payload));
bench("jsonCodec.decode", () => jsonCodec.decode(jsonEncoded));
bench("richCodec.decode", () => richCodec.decode(richEncoded));

console.log("\n=== STORE DEKORATÖRLERİ (InMemory üzerinde) ===");
const silent = createLogger({ level: "silent" });
const plain = new InMemoryCacheStore();
const timed = new TimeoutCacheStore(new InMemoryCacheStore(), { timeoutMs: 200, logger: silent });
const full = new CircuitBreakerCacheStore(new TimeoutCacheStore(new InMemoryCacheStore(), { timeoutMs: 200 }), { logger: silent });
await plain.set("k", richEncoded); await timed.set("k", richEncoded); await full.set("k", richEncoded);

async function benchAsync(label: string, fn: () => Promise<unknown>, iterations = 50_000) {
  await fn();
  const t = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  console.log(`${label.padEnd(38)} ${((performance.now() - t) * 1000 / iterations).toFixed(2)} µs/işlem`);
}
await benchAsync("çıplak store.get", () => plain.get("k"));
await benchAsync("Timeout(store).get", () => timed.get("k"));
await benchAsync("CircuitBreaker(Timeout(store)).get", () => full.get("k"));
process.exit(0);
