import Redis from "ioredis";
import { env } from "../../config/env";
import { logger } from "../logger/logger";

const log = logger.child({ module: "redis.client" });

export const redis = new Redis(env.REDIS_URL);

redis.on("error", (err) => {
  log.error({ err }, "redis bağlantı hatası");
});
