import pino, { type Logger, type LoggerOptions, type TransportTargetOptions } from "pino";

export type { Logger, TransportTargetOptions };

/**
 * core/ proje-bağımsız kalmalı: bu fabrika `env`/`shared` bilmez, seviye ve
 * hedef tercihini çağıran belirler. Proje kendi kök logger'ını
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
  /**
   * BİR veya BİRDEN FAZLA log hedefi (pino transport targets). Verilirse `pretty`
   * yok sayılır ve loglar bu hedeflerin HEPSİNE yazılır — örn. aynı anda konsol +
   * dosya + uzak toplayıcı; her hedef kendi `level`'ını alabilir. İhtiyaca göre
   * proje tek hedef de birden fazla hedef de geçebilir.
   */
  transports?: TransportTargetOptions[];
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const { level = "info", pretty = false, bindings, transports } = options;

  const pinoOptions: LoggerOptions = {
    level,
    // Error nesneleri (stack dahil) doğru serileşsin — düz console.error(err)
    // yerine geçen tüm çağrılar bunu otomatik kullanır.
    serializers: { err: pino.stdSerializers.err },
    ...(bindings ? { base: bindings } : {}),
    ...buildTransport({ pretty, transports }),
  };

  return pino(pinoOptions);
}

/**
 * Hedef seçimi: açık `transports` > `pretty` kısayolu > ham JSON. Birden fazla
 * hedef varsa pino hepsine paralel yazar (`transport.targets`).
 */
function buildTransport({
  pretty,
  transports,
}: Pick<CreateLoggerOptions, "pretty" | "transports">): Pick<LoggerOptions, "transport"> {
  if (transports && transports.length > 0) {
    return { transport: { targets: transports } };
  }
  if (pretty) {
    return {
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    };
  }
  return {};
}
