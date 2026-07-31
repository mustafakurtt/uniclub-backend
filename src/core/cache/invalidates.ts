import type { Context, MiddlewareHandler, Next } from "hono";
import type { CacheEffect } from "./keyspace";
import { createLogger, type Logger } from "../logger/logger";

// core/ proje-bağımsız kalmalı: shared/logger'ı DEĞİL, doğrudan core/logger'ı
// örnekliyoruz (audit-hook.ts ile aynı gerekçe — core → shared bağımlılığı yok).
const defaultLogger = createLogger({ bindings: { module: "core.cache.invalidates" } });

export interface InvalidatesOptions {
  /** Verilmezse core'un kendi logger'ı. */
  logger?: Logger;
  /**
   * Hangi yanıt durumunda invalidasyon tetiklenir. Varsayılan: 2xx.
   * Fazladan invalidasyon ZARARSIZDIR (yalnızca yeniden hesaplatır); EKSİK
   * invalidasyon bayat veri demektir — bu yüzden eşik bilinçli olarak geniştir.
   */
  shouldInvalidate?: (status: number) => boolean;
}

const isSuccess = (status: number) => status >= 200 && status < 300;

/**
 * Bir cache EFEKTİNİ rotaya BİLDİRİMSEL olarak bağlar — `guard()` ile aynı
 * kompozisyon stili:
 *
 *   facultiesRoutes.post(
 *     "/:universityId/faculties",
 *     ...guard(UniversityPermission.FACULTY_CREATE, { tenantScoped: true }),
 *     invalidates(universityEffects.facultyChanged, fromParams("universityId")),
 *     validate("json", createFacultySchema),
 *     handler
 *   );
 *
 * NEDEN ROTADA? İnvalidasyon eskiden servis gövdelerinde elle çağrılıyordu; yeni
 * bir yazma yolu eklenip unutulduğunda hata SESSİZDİ (TTL dolana kadar bayat veri).
 * Rota tanımında durunca invalidasyon, yetkilendirme gibi, kaynağın sözleşmesinin
 * GÖRÜNÜR bir parçası olur ve servis katmanı cache'i hiç bilmez. Çapraz-feature
 * yazarlar (ör. başka bir feature'ın moderasyon rotası) da aynı efekti bildirerek
 * kapsanır — "ne düşecek" bilgisi tek yerde (keyspace) kalır.
 *
 * HTTP DIŞI yazarlar (kuyruk işçisi, servis→servis) aynı efekti `effect.emit(...)`
 * ile doğrudan tetikler. Kural: HTTP'den ulaşılabilen mutasyonu ROTA bildirir.
 *
 * SIRALAMA: `next()` sarmalanır, yani handler'dan SONRA çalışır. Parametre
 * çözücü de handler'dan sonra koşar — böylece yalnızca path/query'yi değil,
 * handler'ın `c.set(...)` ile bıraktığı değerleri (ör. yeni kaydın id'si) de
 * okuyabilir.
 *
 * HATA POLİTİKASI: invalidasyon hatası isteği DÜŞÜRMEZ, error seviyesinde loglanır.
 * Gerekçe: yazma zaten başarıyla tamamlandı; 500 dönmek istemciyi başarılı bir
 * oluşturmayı tekrarlamaya iter. Bayatlık ise sınırlıdır — TTL telafi eder, üstelik
 * Redis tamamen düştüyse okumalar da fail-open ile kaynağa gider (bkz. Cache).
 */
export function invalidates(
  effect: CacheEffect<[]>,
  options?: InvalidatesOptions
): MiddlewareHandler;
export function invalidates<P extends unknown[]>(
  effect: CacheEffect<P>,
  resolve: (c: Context) => P,
  options?: InvalidatesOptions
): MiddlewareHandler;
export function invalidates(
  effect: CacheEffect<any[]>,
  resolveOrOptions?: ((c: Context) => unknown[]) | InvalidatesOptions,
  maybeOptions?: InvalidatesOptions
): MiddlewareHandler {
  const resolve = typeof resolveOrOptions === "function" ? resolveOrOptions : undefined;
  const options = (typeof resolveOrOptions === "function" ? maybeOptions : resolveOrOptions) ?? {};
  const log = options.logger ?? defaultLogger;
  const shouldInvalidate = options.shouldInvalidate ?? isSuccess;

  return async (c: Context, next: Next) => {
    await next();
    if (!shouldInvalidate(c.res.status)) return;

    try {
      await effect.emit(...(resolve ? resolve(c) : []));
    } catch (error) {
      log.error(
        { err: error, effect: effect.name, method: c.req.method, path: c.req.path },
        "cache invalidation failed; entries may be stale until TTL"
      );
    }
  };
}

/**
 * `invalidates` için path parametrelerinden efekt argümanları üreten çözücü.
 * İsimler efektin parametre SIRASIYLA verilir:
 *
 *   invalidates(universityEffects.facultyDeleted, fromParams("universityId", "facultyId"))
 *
 * Eksik bir parametre (rota deseninde olmayan ad) SESSİZCE geçilmez — yanlış
 * anahtar silmek, doğru anahtarı bayat bırakmak demektir. Hata fırlatılır;
 * `invalidates` onu error seviyesinde loglar.
 */
export function fromParams<const N extends readonly string[]>(
  ...names: N
): (c: Context) => { -readonly [K in keyof N]: string } {
  return (c) =>
    names.map((name) => {
      const value = c.req.param(name);
      if (value === undefined) {
        throw new Error(`fromParams: rotada "${name}" adlı path parametresi yok`);
      }
      return value;
    }) as { -readonly [K in keyof N]: string };
}
