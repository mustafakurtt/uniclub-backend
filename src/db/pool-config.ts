import { env } from "../config/env";

/**
 * Uygulama sunucusu Postgres havuzu (postgres-js).
 * Tek süreç, onlarca eşzamanlı istek — perf ölçümünde doygunluk ~50 civarında.
 */
export function getAppPoolOptions() {
  return {
    max: env.DATABASE_POOL_MAX,
    idle_timeout: env.DATABASE_POOL_IDLE_TIMEOUT,
    max_lifetime: env.DATABASE_POOL_MAX_LIFETIME,
    connect_timeout: env.DATABASE_POOL_CONNECT_TIMEOUT,
  };
}

/** Kısa ömürlü CLI scriptleri (seed, bootstrap) — küçük havuz, hızlı kapanış. */
export function getScriptPoolOptions() {
  return {
    max: env.DATABASE_SCRIPT_POOL_MAX,
    idle_timeout: 10,
    max_lifetime: 300,
    connect_timeout: env.DATABASE_POOL_CONNECT_TIMEOUT,
  };
}
