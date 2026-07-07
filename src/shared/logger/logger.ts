import { createLogger } from "../../core/logger/logger";
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

export const logger = createLogger({
  level: env.LOG_LEVEL ?? defaultLevel,
  pretty: env.NODE_ENV !== "production",
  bindings: { app: "universityClub" },
});
