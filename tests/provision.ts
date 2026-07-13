/**
 * Test veritabanını sıfırdan hazırlar: `uniclub_test`'i DROP + CREATE eder,
 * migration'ları uygular, seed'i basar, test Redis DB'sini temizler.
 *
 * Her koşuda pristine (bozulmamış) seed durumu garantilenir — testler
 * deterministik seed verisine (sabit e-posta/rol/kulüp) dayanabilsin diye.
 * `bun test`'ten ÖNCE çalıştırılır (bkz. package.json test:setup / CI).
 */
import postgres from "postgres";
import Redis from "ioredis";
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL, TEST_REDIS_URL } from "./config";

const TEST_DB_NAME = new URL(TEST_DATABASE_URL).pathname.slice(1);

async function run(cmd: string[], env: Record<string, string>): Promise<void> {
  const proc = Bun.spawn(cmd, {
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`✗ komut başarısız (${code}): ${cmd.join(" ")}`);
    process.exit(code);
  }
}

// 1. İzole test veritabanını sıfırla. WITH (FORCE) açık bağlantıları koparır (PG13+).
const admin = postgres(ADMIN_DATABASE_URL, { max: 1 });
await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);
await admin.end();
console.log(`✓ ${TEST_DB_NAME} yeniden oluşturuldu`);

// 2. Migration'lar + seed, test veritabanına karşı.
//    NODE_ENV=development: seed prod'da açık onay olmadan çalışmayı reddeder.
const childEnv = {
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  NODE_ENV: "development",
};
await run(["bunx", "drizzle-kit", "migrate"], childEnv);
await run(["bun", "run", "src/db/seed.ts"], childEnv);

// 3. Test Redis DB'sini temizle (önceki koşudan kalan RBAC cache / rate-limit).
const redis = new Redis(TEST_REDIS_URL);
await redis.flushdb();
await redis.quit();

console.log("✓ test ortamı hazır");
process.exit(0);
