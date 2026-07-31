import { createRedisClient } from "../../core/redis/redis";
import { env } from "../../config/env";
import { logger } from "../logger/logger";

/**
 * Uygulamanın paylaşılan Redis bağlantısı — taşınabilir `createRedisClient`
 * fabrikasının bu projeye özel kurulumu (URL env'den, hata bu projenin logger'ına).
 *
 * `commandTimeout` NEDEN VAR (ölçülmüş gerçek): ioredis bağlantı koptuğunda komutu
 * HATA VERMEZ — kuyruğa alıp yeniden dener (`enableOfflineQueue` +
 * `maxRetriesPerRequest`). Yani çağrı başarısız olmaz, **asılı kalır**. Bu projede
 * ölçüldü: Redis konteyneri durdurulduğunda tek bir okuma **~43 saniye** sürdü.
 * Uygulama fail-open olduğu için istek DÜŞMEZ, ama o 43 saniye zaten ödenmiştir —
 * arıza sessizce bir GECİKME arızasına dönüşür.
 *
 * `commandTimeout` bunu İSTEMCİ seviyesinde, yani bu bağlantıyı kullanan HERKES
 * için sınırlar: rate-limit sayaçları (giriş yolu!), WS bileti (SETEX/GETDEL),
 * notifications publish. Her port'a ayrı bir timeout sarmalayıcısı yazmak yerine
 * doğru katman burasıdır.
 *
 * Değer seçimi: aynı docker ağındaki Redis milisaniye ölçeğinde cevap verir;
 * 500 ms yüz kat pay bırakır, dolayısıyla sağlıklı çalışmada ASLA tetiklenmez —
 * yalnızca gerçek bir arızada devreye girer.
 *
 * KAPSAM DIŞI (bilerek):
 * - `redis.subscriber.ts` AYRI bir bağlantıdır ve commandTimeout ALMAZ; abonelik
 *   uzun ömürlüdür, komut zaman aşımı oraya uymaz.
 * - BullMQ kendi bağlantısını kurar (bkz. auth.queue.ts), bu ayardan etkilenmez;
 *   kuyruk işleri arka plandadır, istek yolunda değildir.
 * - Cache ayrıca KENDİ 200 ms timeout'unu + devre kesicisini taşır (bkz.
 *   shared/cache/cache.client.ts) — o katmanın daha sıkı bütçesidir. Buradaki
 *   500 ms tüm bağlantı için son emniyet ağıdır.
 */
export const redis = createRedisClient({
  url: env.REDIS_URL,
  options: { commandTimeout: 500 },
  logger: logger.child({ module: "redis.client" }),
});
