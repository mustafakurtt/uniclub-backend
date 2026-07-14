import { createLogger, type TransportTargetOptions } from "../../core/logger/logger";
import { env } from "../../config/env";

/**
 * Uygulamanın KÖK logger'ı. Diğer tüm dosyalar (core/rbac/audit-hook.ts hariç
 * — bkz. o dosyadaki not) buradan `logger.child({ module: "..." })` ile
 * modüle özel bir alt logger türetir; ayrı bir konsol satırı yazmaz.
 *
 * Seviye: LOG_LEVEL verilmemişse NODE_ENV'e göre (prod → info, aksi → debug).
 * Bu sayede eskiden `if (env.NODE_ENV === "development") console.log(...)`
 * şeklindeki manuel kontroller artık gereksiz — dev'de zaten debug açık,
 * prod'da zaten kapalı.
 */
const defaultLevel = env.NODE_ENV === "production" ? "info" : "debug";

/**
 * Loglara sızması istenmeyen hassas alanlar — pino bu yolları `[Redacted]` ile
 * maskeler (core/logger'daki `redact` dikişi). Eşleşme, loglanan NESNENİN
 * şekline göredir: asıl amaç kazara sızıntıyı yakalamak (ör. `log.info({ user })`
 * dendiğinde `user.passwordHash` maskelensin). `*.x` bir seviye altını, `x` kökü
 * eşler. Header'lar normalde loglanmıyor ama savunma amaçlı authorization da listede.
 */
const REDACT_PATHS = [
  "password",
  "*.password",
  "passwordHash",
  "*.passwordHash",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "req.headers.authorization",
  "headers.authorization",
];

const isProduction = env.NODE_ENV === "production";

/**
 * Log hedeflerini (transport) ortama göre kurar — çıktının NEREYE gideceği bir
 * dağıtım kararıdır, kod değil; bu yüzden env ile sürülür (core'un `transports`
 * dikişi üzerinden). Vendor-bağımsız ve ek bağımlılık yok (yalnızca pino'nun
 * dahili `pino/file` + `pino-pretty` hedefleri).
 *
 * - LOG_FILE yoksa (yaygın durum): `undefined` döner → createLogger varsayılanı;
 *   dev'de renkli `pretty`, prod'da SENKRON ham stdout JSON (transport worker'ı
 *   yok — en sağlam prod yolu; logları platform/Docker log driver toplar).
 * - LOG_FILE varsa: konsol + dosya, İKİSİNE birden yazılır. `transports` verilince
 *   createLogger `pretty`yi yok sayar, o yüzden konsol hedefi açıkça eklenir.
 */
function buildLogTransports(): TransportTargetOptions[] | undefined {
  if (!env.LOG_FILE) return undefined;

  const consoleTarget: TransportTargetOptions = isProduction
    ? { target: "pino/file", options: { destination: 1 } } // stdout (fd=1), ham JSON
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      };

  return [
    consoleTarget,
    // Dosyaya ham JSON. `mkdir` üst klasörü yoksa oluşturur; bir toplayıcı ajan tail'ler.
    { target: "pino/file", options: { destination: env.LOG_FILE, mkdir: true } },
  ];
}

export const logger = createLogger({
  level: env.LOG_LEVEL ?? defaultLevel,
  pretty: !isProduction,
  bindings: { app: "universityClub" },
  redact: REDACT_PATHS,
  transports: buildLogTransports(),
});
