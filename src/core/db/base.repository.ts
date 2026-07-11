import { eq, sql, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import type { PgAsyncDatabase, PgColumn, PgTable } from "drizzle-orm/pg-core";

/** Drizzle veritabanı örneği (driver-agnostik: postgres-js, node-postgres...). */
export type Database = PgAsyncDatabase<any, any>;

/**
 * Drizzle tabanlı, tekrar kullanılabilir CRUD taban sınıfı. "batteries-included"
 * core tercihinin bir parçası: core artık drizzle-orm'a (ioredis/nodemailer gibi)
 * bilinçli olarak bağlıdır. `id` kolonu olan HERHANGİ bir pg tablosu için mekanik
 * CRUD'u tek yerde toplar; feature repo'ları bunu EXTEND edip yalnızca kendi
 * ilişkisel/özel sorgularını (db.query ... with/columns) yazar.
 *
 * Tipler tabloya göre otomatik çıkarılır (InferSelect/InferInsert). İçeride
 * drizzle'ın generic-tablo HKT'leriyle boğuşmamak için sonuçlar diziye cast edilir
 * (destructuring yerine index) — dışa dönük imzalar tam tiplidir.
 */
export type WithId = PgTable & { id: PgColumn };
export type IdOf<TTable extends WithId> = InferSelectModel<TTable>["id"];

export class BaseRepository<TTable extends WithId> {
  constructor(
    protected readonly db: Database,
    protected readonly table: TTable
  ) {}

  /** Tek kayıt oluşturur ve döndürür. */
  async create(values: InferInsertModel<TTable>): Promise<InferSelectModel<TTable>> {
    const rows = (await this.db
      .insert(this.table)
      .values(values as any)
      .returning()) as InferSelectModel<TTable>[];
    return rows[0];
  }

  /** Birden fazla kayıt oluşturur. Boş dizide DB'ye gitmez. */
  async createMany(values: InferInsertModel<TTable>[]): Promise<InferSelectModel<TTable>[]> {
    if (values.length === 0) return [];
    return (await this.db
      .insert(this.table)
      .values(values as any)
      .returning()) as InferSelectModel<TTable>[];
  }

  /** id ile tek kayıt; yoksa undefined. */
  async findById(id: IdOf<TTable>): Promise<InferSelectModel<TTable> | undefined> {
    const rows = (await this.db
      .select()
      .from(this.table as PgTable)
      .where(eq(this.table.id, id))
      .limit(1)) as InferSelectModel<TTable>[];
    return rows[0];
  }

  /** Tüm kayıtlar (opsiyonel limit/offset). Büyük tablolarda limit verin. */
  async findAll(options?: { limit?: number; offset?: number }): Promise<InferSelectModel<TTable>[]> {
    let query = this.db.select().from(this.table as PgTable).$dynamic();
    if (options?.limit !== undefined) query = query.limit(options.limit);
    if (options?.offset !== undefined) query = query.offset(options.offset);
    return (await query) as InferSelectModel<TTable>[];
  }

  /** id ile günceller ve güncellenmiş kaydı döndürür; kayıt yoksa undefined. */
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

  /** id ile siler. Kayıt silindiyse true. */
  async deleteById(id: IdOf<TTable>): Promise<boolean> {
    const rows = (await this.db
      .delete(this.table)
      .where(eq(this.table.id, id))
      .returning()) as unknown[];
    return rows.length > 0;
  }

  /** Toplam kayıt sayısı. */
  async count(): Promise<number> {
    const rows = (await this.db
      .select({ value: sql<number>`cast(count(*) as int)` })
      .from(this.table as PgTable)) as { value: number }[];
    return rows[0]?.value ?? 0;
  }

  /** id'li kayıt var mı? (findById'den ucuz — sadece sabit çeker.) */
  async existsById(id: IdOf<TTable>): Promise<boolean> {
    const rows = (await this.db
      .select({ one: sql<number>`1` })
      .from(this.table as PgTable)
      .where(eq(this.table.id, id))
      .limit(1)) as unknown[];
    return rows.length > 0;
  }
}
