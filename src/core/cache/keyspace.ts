import type { Cache, WriteOptions } from "./cache";

/**
 * TİPLİ KEYSPACE — `Cache` facade'ının üstünde, feature dikişindeki ergonomi katmanı.
 *
 * Sorun: elle yazılan `<feature>.cache.ts` dosyaları aynı bilgiyi ÜÇ paralel listede
 * tekrarlıyordu (anahtar üretimi / okuma sarmalayıcısı / invalidasyon sarmalayıcısı)
 * ve cache'lenen değerin TİPİ hiçbir yerde beyan edilmiyordu (`<T>` loader'dan
 * çıkarsanıyordu — iki çağıran aynı anahtara farklı şekil yazsa derleyici susardı).
 *
 * Çözüm: bir GİRDİ (entry) = anahtar üretimi + değer tipi + TTL, tek beyanda. Okuma
 * (`read`) ve invalidasyon (`drop`) aynı nesneden çıkar, dolayısıyla ayrışamazlar.
 *
 * İkinci kavram EFEKT (effect): "şu iş olayı olduğunda şu girdiler düşer" ilişkisi.
 * Invalidasyonun NE düşüreceği bilgisi böylece TEK yerde toplanır; NEREDE
 * tetikleneceği (rota middleware'i — bkz. invalidates.ts — ya da HTTP dışı bir
 * yazar) çağırana kalır.
 *
 * Kapsam notu: bu katman `Cache`'e yeni bir depolama yeteneği EKLEMEZ (tag/grup
 * invalidasyonu, tarama vb. yok). Yalnızca anahtar uzayını tipler ve ilişkileri
 * bildirimsel hale getirir — bu yüzden mevcut `CacheStore` port'u değişmeden kalır.
 */

/**
 * Bağlanmış (parametreleri verilmiş) tek bir cache girdisi. Anahtar ve değer tipi
 * sabittir; `read` yalnızca o tipi üreten bir loader kabul eder.
 */
export interface CacheEntry<V> {
  /**
   * Girdinin keyspace'teki BEYAN adı (ör. "faculties") — anahtarın kendisi değil.
   * Kapsam denetimi (`uncoveredEntries`) üretilmiş bir girdiyi tanımına bununla
   * geri bağlar.
   */
  readonly name: string;
  /** Namespace'e GÖRE anahtar (tam anahtarı `Cache` kendi önekiyle üretir). */
  readonly key: string;
  /**
   * Girdinin bağlı olduğu namespace'li cache. Efektler birden çok namespace'ten
   * girdi toplayabildiği için (çapraz-feature invalidasyon) silmeleri buna göre
   * gruplamak zorundadır — `dropEntries`'in ihtiyacı budur.
   */
  readonly cache: Cache;
  /** Read-through: cache'te varsa döner, yoksa `loader` ile hesaplayıp yazar. */
  read(loader: () => Promise<V>, options?: WriteOptions): Promise<V>;
  /** Yalnızca bu girdiyi düşürür. Hata YUTULMAZ (bkz. `Cache.delete`). */
  drop(): Promise<void>;
}

/**
 * Bir girdi TANIMI: değer tipi (`V`), anahtar parametreleri (`P`) ve opsiyonel TTL.
 * `entry()` ile üretilir, `defineKeyspace()` ile bir cache'e bağlanır.
 */
export interface EntrySpec<V, P extends unknown[]> {
  readonly build: (...params: P) => string;
  readonly ttlSeconds?: number;
  /**
   * YALNIZCA tip taşıyıcısı — çalışma anında ne yazılır ne okunur. `V`'nin tip
   * imzasında görünmesini sağlar ki `infer V` ile geri çıkarılabilsin.
   */
  readonly value?: V;
}

/** Değer tipinden bağımsız, `dropEntries`'in ihtiyaç duyduğu minimal girdi yüzeyi. */
export type DroppableEntry = Pick<CacheEntry<unknown>, "name" | "key" | "cache">;

export interface EntryOptions {
  /** Bu girdiye özel TTL (saniye). Verilmezse cache'in varsayılanı. */
  ttlSeconds?: number;
}

/**
 * `entry<V>()`'nin döndürdüğü fabrika. İki AŞIRI YÜKLEMESİ var: sabit anahtar
 * (parametresiz girdi) ve anahtar üreteci (parametreleri çıkarsanan girdi). Tek
 * imzayla yazılsaydı sabit anahtar durumunda çıkarım `any[]`e düşer, girdi
 * parametresiz olmasına rağmen her argümanı kabul ederdi.
 */
export interface EntryFactory<V> {
  (key: string, options?: EntryOptions): EntrySpec<V, []>;
  <P extends unknown[]>(build: (...params: P) => string, options?: EntryOptions): EntrySpec<V, P>;
}

/**
 * Girdi tanımlar. İKİ AŞAMALI çağrıdır (`entry<T>()(...)`) çünkü TypeScript kısmi
 * tip argümanı çıkarımı yapamaz: değer tipini ELLE vermek, anahtar parametrelerini
 * builder'dan ÇIKARSAMAK istiyoruz.
 *
 *   entry<Faculty[]>()((universityId: string) => `faculties:${universityId}`)
 *   entry<UniversityListItem[]>()("list")                 // parametresiz
 *   entry<Counts>()((id: string) => `x:${id}`, { ttlSeconds: 30 })
 */
export function entry<V>(): EntryFactory<V> {
  const make = (
    key: string | ((...params: never[]) => string),
    options?: EntryOptions
  ): EntrySpec<V, never[]> => ({
    build: typeof key === "string" ? () => key : key,
    ttlSeconds: options?.ttlSeconds,
  });

  return make as EntryFactory<V>;
}

type AnySpec = EntrySpec<any, any[]>;

/** Tanım haritasını, çağrıldığında bağlı girdi üreten fonksiyonlara çevirir. */
export type Keyspace<S extends Record<string, AnySpec>> = {
  readonly [K in keyof S]: S[K] extends EntrySpec<infer V, infer P>
    ? (...params: P) => CacheEntry<V>
    : never;
};

export interface KeyspaceOptions {
  /**
   * ŞEMA DAMGASI. Cache'lenen değerlerin ŞEKLİ değiştiğinde artırın (ör. bir
   * repository sorgusuna kolon eklendi, bir ilişki `with`'e girdi).
   *
   * Neden gerekli: şekil değişikliği SESSİZDİR. Eski girdi hâlâ geçerli JSON'dur,
   * yalnızca eksik alanlıdır — `tryDecode` onu bozuk saymaz, yakalayamaz. Deploy
   * sonrası TTL boyunca (varsayılan 5 dk) eksik alanlı cevaplar döner. Sürüm
   * artırınca anahtar uzayı (`university:v2:…`) değişir, eski girdilere hiç
   * erişilmez ve TTL ile temizlenirler.
   *
   * Verilmezse önek sürümsüzdür (bugünkü davranış) — yani artırmayı unutmak
   * durumu kötüleştirmez, sadece korumadan yararlanmamış olursunuz.
   */
  version?: number;
}

/**
 * Bir grup girdi tanımını verilen cache'in `namespace`'ine bağlar.
 *
 *   const keys = defineKeyspace(cache, "university", {
 *     list: entry<UniversityList>()("list"),
 *     byId: entry<UniversityDetail>()((id: string) => `byId:${id}`),
 *   });
 *   await keys.byId(id).read(() => repo.findById(id));   // tipli
 *   await keys.list().drop();
 */
export function defineKeyspace<S extends Record<string, AnySpec>>(
  cache: Cache,
  namespace: string,
  specs: S,
  options?: KeyspaceOptions
): Keyspace<S> {
  // Sürüm ÖNEKİN İÇİNDE, namespace'ten SONRA durur (`university:v2:…`) ki Redis'te
  // namespace bazlı tarama (`SCAN university:*`) ve metrik etiketi bozulmasın.
  const ns = cache.namespace(
    options?.version ? `${namespace}:v${options.version}` : namespace
  );
  const bound: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(specs)) {
    bound[name] = (...params: unknown[]) => bindEntry(ns, name, spec, params);
  }

  return bound as Keyspace<S>;
}

function bindEntry(
  ns: Cache,
  name: string,
  spec: AnySpec,
  params: unknown[]
): CacheEntry<unknown> {
  const key = spec.build(...params);
  // Girdinin kendi TTL'i, çağrı-başına verilen options tarafından ezilebilir.
  const specOptions = spec.ttlSeconds !== undefined ? { ttlSeconds: spec.ttlSeconds } : undefined;

  return {
    name,
    key,
    cache: ns,
    read: (loader, options) => ns.getOrSet(key, loader, options ?? specOptions),
    drop: () => ns.delete(key),
  };
}

/**
 * Bir iş olayının cache karşılığı: "bu olduğunda şu girdiler bayatlar".
 *
 * `entries` SAF bir fonksiyondur (I/O yok) — hangi anahtarların düşeceği cache'e
 * hiç dokunmadan test edilebilir. `emit` onu uygular.
 */
export interface CacheEffect<P extends unknown[]> {
  /** Log/teşhis için okunabilir ad (ör. "university.facultyDeleted"). */
  readonly name: string;
  /** Etkilenen girdiler — saf, yan etkisiz. */
  entries(...params: P): readonly DroppableEntry[];
  /**
   * Etkilenen girdileri düşürür. HATAYI YUTMAZ: invalidasyonu sessizce kaçırmak
   * bayat veri demektir, çağıran ne yapacağına kendi karar vermeli. (HTTP yolunda
   * bu kararı `invalidates()` middleware'i verir — bkz. invalidates.ts.)
   */
  emit(...params: P): Promise<void>;
}

/**
 * Efekt tanımlar.
 *
 *   const facultyDeleted = effect(
 *     "university.facultyDeleted",
 *     (universityId: string, facultyId: string) =>
 *       [keys.faculties(universityId), keys.departments(facultyId)]
 *   );
 */
export function effect<P extends unknown[]>(
  name: string,
  entries: (...params: P) => readonly DroppableEntry[]
): CacheEffect<P> {
  return {
    name,
    entries,
    emit: (...params: P) => dropEntries(entries(...params)),
  };
}

/**
 * KAPSAM DENETİMİ — hangi cache girdilerini HİÇBİR efekt düşürmüyor?
 *
 * Bir girdinin cache'lenip hiçbir efektle düşürülmemesi, sessiz bir hata sınıfıdır:
 * o anahtar TTL dolana kadar kalıcı olarak bayat kalır. İnvalidasyon KARARINI
 * otomatikleştiremeyiz (hangi yazmanın neyi bayatlattığı iş bilgisidir), ama
 * "karar verilmemiş girdi" olup olmadığını otomatik YAKALAYABİLİRİZ.
 *
 * Kullanım (test): keyspace'i ve efektlerin ÖRNEK argümanlarla ürettiği girdi
 * listelerini ver; geriye kapsanmamış girdi adları döner (boş olmalı).
 *
 *   expect(uncoveredEntries(universityCache, [
 *     universityEffects.universityCreated.entries(),
 *     universityEffects.facultyDeleted.entries("u", "f"),
 *   ])).toEqual([]);
 *
 * TTL-tabanlı keyspace'ler (bilinçli olarak efektsiz — ör. staleness-toleranslı
 * sayaçlar) bu denetimin DIŞINDA tutulur; bu da bilinçli bir karar olarak yazılır.
 */
export function uncoveredEntries(
  keyspace: Record<string, unknown>,
  droppedByEffects: readonly (readonly DroppableEntry[])[]
): string[] {
  const covered = new Set(droppedByEffects.flat().map((e) => e.name));
  return Object.keys(keyspace).filter((name) => !covered.has(name));
}

/**
 * Girdi listesini düşürür. Aynı cache'e (namespace'e) düşen anahtarlar TEK bir
 * `delete` çağrısında toplanır — Redis'e girdi başına tur atmamak için. Farklı
 * namespace'ler (çapraz-feature efektler) paralel gider.
 */
export async function dropEntries(entries: readonly DroppableEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const byCache = new Map<Cache, Set<string>>();
  for (const item of entries) {
    const keys = byCache.get(item.cache);
    if (keys) keys.add(item.key);
    else byCache.set(item.cache, new Set([item.key]));
  }

  await Promise.all([...byCache].map(([cache, keys]) => cache.delete([...keys])));
}
