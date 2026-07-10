/**
 * Test preload — HER test dosyasından ve HERHANGİ bir src/ importundan ÖNCE koşar.
 *
 * src/config/env.ts, process.env'i import anında zod ile okur; bu yüzden uygulama
 * modül grafiği yüklenmeden ÖNCE ortamı izole test veritabanına/Redis'ine çevirmek
 * ZORUNDAYIZ. bunfig.toml [test].preload bu dosyayı en başa alır.
 *
 * Bu dosya src/'ten hiçbir şey import etmez (sadece ./config), yoksa env'i
 * ayarlamadan env.ts'i tetiklerdik.
 */
import { TEST_DATABASE_URL, TEST_REDIS_URL } from "./config";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.JWT_SECRET ||= "test-secret-not-used-anywhere-else-min-len";
process.env.RATE_LIMIT_DISABLED = "true"; // testler hız sınırına takılmasın
process.env.LOG_LEVEL ||= "error"; // test çıktısını sessizleştir (beklenen 4xx'ler warn üretir)
