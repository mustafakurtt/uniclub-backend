import { and, eq, isNull, sql, type InferInsertModel, type InferSelectModel, type SQL } from "drizzle-orm";
import type { PgAsyncDatabase, PgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * ⚠️ Drizzle + PostgreSQL'e ÖZGÜ modül. core/'un tek DB/ORM-bağımlı parçası
 * (base.entity ile birlikte). Yine de PROJE-BAĞIMSIZDIR: env okumaz, proje
 * alanı bilmez — `id` kolonu olan HERHANGİ bir pg tablosu için çalışır.
 *
 * Yetenekler: mekanik CRUD + yumuşak silme (soft delete) + transaction + ilişkisel
 * sorgu erişimi. Feature repo'ları bunu EXTEND eder; mekanik işleri buradan alır,
 * yalnızca özel/ilişkisel sorgularını yazar (protected `query` ile tam tipli).
 */

/** Drizzle veritabanı örneği (driver-agnostik: postgres-js, node-postgres...). */
export type Database = PgAsyncDatabase<any, any>;

export type WithId = PgTable & { id: PgColumn };
export type IdOf<TTable extends WithId> = InferSelectModel<TTable>["id"];

export interface BaseRepositoryOptions<TQuery> {
  /**
   * true ise `deleteById` YUMUŞAK siler (deletedAt=now) ve okuma metodları silinmiş
   * kayıtları varsayılan olarak hariç tutar. Tablo `deletedAt` kolonu taşımalı
   * (bkz. base.entity `softDeleteColumn`).
   */
  softDelete?: boolean;
  /**
   * Bu tablonun ilişkisel sorgu kurucusu (`db.query.<table>`). Alt sınıflara tam
   * tipli relational erişim (`with`/`columns`/`orderBy`) sağlar — `this.query`.
   */
  query?: TQuery;
}

/** Okuma metodlarında silinmiş kayıtları da dahil etme seçeneği. */
export interface ReadOptions {
  withDeleted?: boolean;
}

export class BaseRepository<TTable extends WithId, TQuery = unknown> {
  protected readonly softDelete: boolean;
  /** Alt sınıfların tam tipli ilişkisel sorgular çalıştırması için (db.query.<table>). */
  protected readonly query?: TQuery;
  private readonly deletedAt?: PgColumn;

  constructor(
    protected readonly db: Database,
    protected readonly table: TTable,
    options: BaseRepositoryOptions<TQuery> = {}
  ) {
    this.softDelete = options.softDelete ?? false;
    this.query = options.query;
    if (this.softDelete) {
      this.deletedAt = (this.table as Record<string, unknown>).deletedAt as PgColumn | undefined;
      if (!this.deletedAt) {
        throw new Error("BaseRepository: softDelete=true ama tabloda `deletedAt` kolonu yok.");
      }
    }
  }

  // ── Yazma ──────────────────────────────────────────────────────────────
  async create(values: InferInsertModel<TTable>): Promise<InferSelectModel<TTable>> {
    const rows = (await this.db.insert(this.table).values(values as any).returning()) as InferSelectModel<TTable>[];
    return rows[0];
  }

  async createMany(values: InferInsertModel<TTable>[]): Promise<InferSelectModel<TTable>[]> {
    if (values.length === 0) return [];
    return (await this.db.insert(this.table).values(values as any).returning()) as InferSelectModel<TTable>[];
  }

  async updateById(
    id: IdOf<TTable>,
    values: Partial<InferInsertModel<TTable>>
  ): Promise<InferSelectModel<TTable> | undefined> {
    const rows = (await this.db
      .update(this.table)
      .set(values as any)
      .where(eq(this.table.id, id))
      .returning()) as InferSelectModel<TTable>[];
    return rows[0];
  }

  /**
   * softDelete=true ise deletedAt=now (yumuşak), değilse fiziksel siler. Kayıt
   * etkilendiyse true. (Zaten yumuşak silinmiş kayıt tekrar "silinir"se yine true.)
   */
  async deleteById(id: IdOf<TTable>): Promise<boolean> {
    if (this.softDelete) {
      const rows = (await this.db
        .update(this.table)
        .set({ deletedAt: new Date() } as any)
        .where(eq(this.table.id, id))
        .returning()) as unknown[];
      return rows.length > 0;
    }
    return this.hardDeleteById(id);
  }

  /** softDelete ayarından BAĞIMSIZ olarak kaydı fiziksel siler. */
  async hardDeleteById(id: IdOf<TTable>): Promise<boolean> {
    const rows = (await this.db.delete(this.table).where(eq(this.table.id, id)).returning()) as unknown[];
    return rows.length > 0;
  }

  /** Yumuşak silinmiş kaydı geri getirir (deletedAt=null). softDelete gerektirir. */
  async restoreById(id: IdOf<TTable>): Promise<InferSelectModel<TTable> | undefined> {
    this.assertSoftDelete("restoreById");
    const rows = (await this.db
      .update(this.table)
      .set({ deletedAt: null } as any)
      .where(eq(this.table.id, id))
      .returning()) as InferSelectModel<TTable>[];
    return rows[0];
  }

  // ── Okuma ──────────────────────────────────────────────────────────────
  async findById(id: IdOf<TTable>, options?: ReadOptions): Promise<InferSelectModel<TTable> | undefined> {
    const rows = (await this.db
      .select()
      .from(this.table as PgTable)
      .where(this.scopedWhere(eq(this.table.id, id), options))
      .limit(1)) as InferSelectModel<TTable>[];
    return rows[0];
  }

  async findAll(options?: ReadOptions & { limit?: number; offset?: number }): Promise<InferSelectModel<TTable>[]> {
    let query = this.db.select().from(this.table as PgTable).$dynamic();
    const alive = this.aliveFilter(options);
    if (alive) query = query.where(alive);
    if (options?.limit !== undefined) query = query.limit(options.limit);
    if (options?.offset !== undefined) query = query.offset(options.offset);
    return (await query) as InferSelectModel<TTable>[];
  }

  async count(options?: ReadOptions): Promise<number> {
    let query = this.db
      .select({ value: sql<number>`cast(count(*) as int)` })
      .from(this.table as PgTable)
      .$dynamic();
    const alive = this.aliveFilter(options);
    if (alive) query = query.where(alive);
    const rows = (await query) as { value: number }[];
    return rows[0]?.value ?? 0;
  }

  async existsById(id: IdOf<TTable>, options?: ReadOptions): Promise<boolean> {
    const rows = (await this.db
      .select({ one: sql<number>`1` })
      .from(this.table as PgTable)
      .where(this.scopedWhere(eq(this.table.id, id), options))
      .limit(1)) as unknown[];
    return rows.length > 0;
  }

  // ── Transaction ──────────────────────────────────────────────────────────
  /**
   * Bir transaction başlatır ve tx'e bağlı bir CRUD repo (+ ham tx) verir. İçeride
   * fırlatılan hata otomatik ROLLBACK'e yol açar. Alt sınıfın ÖZEL metodlarını
   * transaction içinde çalıştırmak için ham `tx`'i (Database) kullanın.
   */
  async transaction<T>(
    fn: (repo: BaseRepository<TTable, TQuery>, tx: Database) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const scoped = new BaseRepository(tx as unknown as Database, this.table, {
        softDelete: this.softDelete,
        query: this.query,
      });
      return fn(scoped, tx as unknown as Database);
    }) as Promise<T>;
  }

  // ── Yardımcılar ────────────────────────────────────────────────────────
  /** Soft-delete açıksa ve withDeleted istenmemişse "deletedAt IS NULL" koşulu. */
  private aliveFilter(options?: ReadOptions): SQL | undefined {
    if (!this.deletedAt || options?.withDeleted) return undefined;
    return isNull(this.deletedAt);
  }

  /** Bir koşulu (örn. id eşitliği) canlılık filtresiyle AND'ler. */
  private scopedWhere(condition: SQL, options?: ReadOptions): SQL {
    const alive = this.aliveFilter(options);
    return alive ? (and(condition, alive) as SQL) : condition;
  }

  private assertSoftDelete(method: string) {
    if (!this.softDelete) {
      throw new Error(`BaseRepository.${method}: yalnızca softDelete=true iken kullanılabilir.`);
    }
  }
}
