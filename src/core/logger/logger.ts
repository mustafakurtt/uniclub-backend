import pino, { type Logger, type LoggerOptions } from "pino";

export type { Logger };

/**
 * core/ proje-bağımsız kalmalı: bu fabrika `env`/`shared` bilmez, seviye ve
 * pretty-print tercihini çağıran belirler. Proje kendi kök logger'ını
 * `shared/logger/logger.ts`'de bu fabrikayı çağırarak kurar — aynı enjeksiyon
 * deseni `setGuardAuditSink` ile kullanılıyor (core mekanizmayı tanımlar,
 * proje kendi örneğini kurar).
 */
export interface CreateLoggerOptions {
  level?: string;
  /** Geliştirmede insan-okunur renkli çıktı; üründe ham JSON (log toplayıcılar için). */
  pretty?: boolean;
  /** Her satıra eklenecek sabit alanlar (örn. { app: "universityClub" }). */
  bindings?: Record<string, unknown>;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const { level = "info", pretty = false, bindings } = options;

  const pinoOptions: LoggerOptions = {
    level,
    // Error nesneleri (stack dahil) doğru serileşsin — düz console.error(err)
    // yerine geçen tüm çağrılar bunu otomatik kullanır.
    serializers: { err: pino.stdSerializers.err },
    ...(bindings ? { base: bindings } : {}),
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
        }
      : {}),
  };

  return pino(pinoOptions);
}
