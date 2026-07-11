import { createRedisClient } from "../../core/redis/redis";
import { env } from "../../config/env";
import { logger } from "../logger/logger";

/**
 * Uygulamanın paylaşılan Redis bağlantısı — taşınabilir `createRedisClient`
 * fabrikasının bu projeye özel kurulumu (URL env'den, hata bu projenin logger'ına).
 */
export const redis = createRedisClient({
  url: env.REDIS_URL,
  logger: logger.child({ module: "redis.client" }),
});
