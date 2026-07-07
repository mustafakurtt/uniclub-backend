import Redis from "ioredis";
import { env } from "../../config/env";
import { logger } from "../logger/logger";

const log = logger.child({ module: "redis.subscriber" });

/**
 * Pub/Sub aboneliği için AYRI bir Redis bağlantısı.
 *
 * ioredis, bir bağlantı `subscribe` edildiği anda onu "subscriber mode"a alır ve
 * o bağlantıda artık normal komutlar (GET/SET/INCR) çalıştırılamaz. Paylaşılan
 * `redis.client.ts` bağlantısını abone yapsaydık RBAC cache okumaları ve rate
 * limit sayaçları kırılırdı. Bu yüzden ikinci bir bağlantı açıyoruz.
 *
 * Yayınlama (publish) için paylaşılan `redis` client'ı kullanılabilir — publish
 * bağlantıyı subscriber moduna sokmaz.
 */
export const redisSubscriber = new Redis(env.REDIS_URL);

redisSubscriber.on("error", (err) => {
  log.error({ err }, "redis (subscriber) bağlantı hatası");
});
