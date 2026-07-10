/**
 * Test altyapısının bağlantı adresleri. Geliştirme/CI veritabanını EZMEMEK için
 * testler ayrı bir `uniclub_test` veritabanına ve ayrı bir Redis DB index'ine
 * (0 yerine 1) bağlanır. Adresler mevcut DATABASE_URL/REDIS_URL'den türetilir,
 * böylece hem yerelde (uniclub_dev) hem CI'da (uniclub_ci) doğru kimlikle çalışır.
 *
 * Bu dosya src/ altından HİÇBİR ŞEY import etmez — setup.ts bunu env'i
 * ayarlamadan önce güvenle okuyabilsin diye.
 */

const DEV_FALLBACK_DB = "postgres://uniclub:uniclub_dev@localhost:5432/uniclub";
const DEV_FALLBACK_REDIS = "redis://localhost:6379";

function withDatabaseName(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function withRedisDb(url: string, dbIndex: number): string {
  const u = new URL(url);
  u.pathname = `/${dbIndex}`;
  return u.toString();
}

/** Bakım bağlantısı — `uniclub_test`'i DROP/CREATE etmek için mevcut bir DB'ye bağlanır. */
export const ADMIN_DATABASE_URL = process.env.DATABASE_URL ?? DEV_FALLBACK_DB;

/** Testlerin koştuğu izole veritabanı. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? withDatabaseName(ADMIN_DATABASE_URL, "uniclub_test");

/** Testlerin kullandığı izole Redis DB (index 1). */
export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? withRedisDb(process.env.REDIS_URL ?? DEV_FALLBACK_REDIS, 1);

/** Testlerdeki tüm seed hesaplarının şifresi (bkz. src/db/seed.ts). */
export const SEED_PASSWORD = "Password123!";
