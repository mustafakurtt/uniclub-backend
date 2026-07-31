import type { Context } from "hono";

/**
 * Taşınabilir sağlık/hazırlık (health & readiness) uçları. core/ proje-bağımsız
 * kalsın diye NEYİN kontrol edileceğini bilmez — kontroller `checks` ile enjekte
 * edilir (createErrorHandler / createShutdownManager ile aynı fabrika deseni).
 *
 * ════════════════════════════════════════════════════════════════════════
 * LIVENESS ile READINESS neden AYRI iki uçtur?
 * ════════════════════════════════════════════════════════════════════════
 * - **Liveness** (`live`): "süreç yaşıyor mu?" Bağımlılıklara ASLA bakmaz ve her
 *   zaman 200 döner. Orkestratör (k8s/ECS) bu uca başarısız derse süreci ÖLDÜRÜR;
 *   buraya DB kontrolü koymak, bir DB kesintisinde tüm pod'ları yeniden başlatma
 *   fırtınasına dönüşür — kesintiyi düzeltmez, büyütür.
 * - **Readiness** (`ready`): "trafik alabilir miyim?" Bağımlılıkları kontrol eder;
 *   başarısızsa yalnızca yük dengeleyici bu örneği havuzdan çıkarır, süreç yaşar
 *   ve toparlanınca kendiliğinden geri döner.
 *
 * ════════════════════════════════════════════════════════════════════════
 * DRAIN — kapanışta neden readiness'i ÖNCE düşürürüz?
 * ════════════════════════════════════════════════════════════════════════
 * SIGTERM geldiği anda sunucuyu kapatmak, yük dengeleyicinin henüz haberi olmadığı
 * için uçuştaki isteklerin bağlantı hatası almasına yol açar. Doğru sıra:
 * readiness'i "down"a çevir → LB bizi havuzdan çıkarsın diye BİRKAÇ SANİYE bekle →
 * sonra kapan. `drainTask()` tam olarak bu görevi üretir ve `createShutdownManager`
 * ile İLK sırada kaydedilir (bkz. shutdown.ts, FIFO):
 *
 *   shutdown.register("drain", health.drainTask(5_000));
 *   shutdown.register("http", () => server.stop());
 *   shutdown.register("db", () => pool.end());
 *
 * Not: cevap gövdesi `{ success, message, data }` API zarfını KULLANMAZ. Bu uçlar
 * insana değil probe'lara (k8s, LB, uptime monitörü) konuşur; şekilleri altyapı
 * sözleşmesidir, i18n'e ve zarfa girmez.
 */

/** Tek bir bağımlılık kontrolü. `run` FIRLATIRSA (veya zaman aşarsa) kontrol düşmüş sayılır. */
export interface HealthCheck {
  /** Rapordaki ad (ör. "postgres", "redis"). */
  name: string;
  /** Kontrolü çalıştırır. Hata fırlatmak = başarısız. */
  run: () => Promise<void> | void;
  /**
   * `false` ise bu kontrolün düşmesi HAZIR-OLMAMA sayılmaz; rapora "down" olarak
   * düşer ama uç yine 200 döner. İsteğe bağlı bağımlılıklar için (ör. mail/SMTP:
   * kesintisi API'yi servis dışı bırakmamalı). Varsayılan `true`.
   */
  critical?: boolean;
}

export type HealthStatus = "up" | "down";

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  critical: boolean;
  durationMs: number;
  /** Yalnızca `exposeErrors: true` iken doldurulur. */
  error?: string;
}

export interface HealthReport {
  /** Kritik kontrollerin hepsi geçtiyse (ve drain edilmiyorsa) "up". */
  status: HealthStatus;
  /** Kapanış draini başladıysa `true` — readiness bu yüzden 503 dönüyordur. */
  draining: boolean;
  uptimeSeconds: number;
  checks: HealthCheckResult[];
}

export interface CreateHealthOptions {
  /** Readiness'te çalıştırılacak bağımlılık kontrolleri. Verilmezse `ready` hep 200. */
  checks?: HealthCheck[];
  /**
   * Kontrol başına süre bütçesi (ms). Aşan kontrol "down" sayılır — askıda kalan
   * bir bağlantı probe'u sonsuza dek bekletmesin. Varsayılan 3000.
   */
  timeoutMs?: number;
  /**
   * Hata mesajını cevaba koy. Varsayılan `false`: `/ready` çoğu kurulumda dışarıya
   * açıktır ve hata metinleri iç altyapıyı (host, sürüm, sorgu) sızdırabilir.
   * Kapalı ağda hata ayıklarken açılabilir.
   */
  exposeErrors?: boolean;
  /** Test edilebilirlik için saat dikişi (bkz. InMemoryRateLimitStore). Varsayılan Date.now. */
  now?: () => number;
}

export interface Health {
  /** Liveness handler: bağımlılıklara bakmaz, her zaman 200. */
  live: (c: Context) => Response;
  /** Readiness handler: kontroller geçerse 200, aksi halde 503. */
  ready: (c: Context) => Promise<Response>;
  /** Ham rapor (özel uç yazmak / açılışta loglamak için). */
  report: () => Promise<HealthReport>;
  /** Readiness'i elle "down"a çeker (geri dönüşü yoktur — yalnızca kapanış içindir). */
  drain: () => void;
  /**
   * `createShutdownManager.register` için hazır kapanış görevi: readiness'i düşürür
   * ve yük dengeleyicinin bizi havuzdan çıkarması için `delayMs` bekler.
   * Varsayılan 5000 (tipik LB probe aralığının 2 katı).
   */
  drainTask: (delayMs?: number) => () => Promise<void>;
  /** Drain başladı mı? */
  readonly draining: boolean;
}

export function createHealth(options: CreateHealthOptions = {}): Health {
  const { checks = [], timeoutMs = 3_000, exposeErrors = false, now = Date.now } = options;
  const startedAt = now();
  let draining = false;

  const runCheck = async (check: HealthCheck): Promise<HealthCheckResult> => {
    const critical = check.critical ?? true;
    const start = now();
    try {
      await withTimeout(check.run(), timeoutMs, check.name);
      return { name: check.name, status: "up", critical, durationMs: now() - start };
    } catch (err) {
      return {
        name: check.name,
        status: "down",
        critical,
        durationMs: now() - start,
        ...(exposeErrors ? { error: err instanceof Error ? err.message : String(err) } : {}),
      };
    }
  };

  const report = async (): Promise<HealthReport> => {
    // Kontroller birbirinden bağımsız — paralel koşar, toplam süre en yavaşı kadardır.
    const results = await Promise.all(checks.map(runCheck));
    const healthy = results.every((r) => !r.critical || r.status === "up");
    return {
      status: draining || !healthy ? "down" : "up",
      draining,
      uptimeSeconds: Math.floor((now() - startedAt) / 1000),
      checks: results,
    };
  };

  return {
    get draining() {
      return draining;
    },

    live(c) {
      // Drain sırasında da 200: liveness "süreç yaşıyor" demektir. Burada 503
      // dönmek, orkestratörün düzgün kapanmakta olan süreci SIGKILL'lemesine yol açar.
      return c.json({ status: "up", uptimeSeconds: Math.floor((now() - startedAt) / 1000) }, 200);
    },

    async ready(c) {
      const result = await report();
      return c.json(result, result.status === "up" ? 200 : 503);
    },

    report,

    drain() {
      draining = true;
    },

    drainTask(delayMs = 5_000) {
      return async () => {
        draining = true;
        if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      };
    },
  };
}

/**
 * Kontrolü süre bütçesine bağlar. Senkron dönen kontroller (Promise değil) zaten
 * anında bitmiştir — timer hiç kurulmaz.
 */
function withTimeout(value: Promise<void> | void, ms: number, name: string): Promise<void> {
  if (!(value instanceof Promise)) return Promise.resolve();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = value.finally(() => clearTimeout(timer));
  // Zaman aşımı yarışı kazanırsa `guarded` sonradan reddedebilir; burada ayrı bir
  // dalda yakalanır ki "unhandled rejection" uyarısı çıkmasın (race yine görür).
  guarded.catch(() => {});

  return Promise.race([
    guarded,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`health check "${name}" timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}
