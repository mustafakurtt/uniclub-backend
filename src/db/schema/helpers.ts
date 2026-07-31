import * as t from "drizzle-orm/pg-core";

/** Append-only tablolarda kullanılan tek kolon (satır güncellenmez → updated_at yok). */
export const createdAtColumn = {
  createdAt: t.timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Bileşik (çok kolonlu) yabancı anahtar — çapraz-tenant kilidinin aracı.
 *
 * NEDEN SARMALAYICI: drizzle'ın `foreignKey()` jeneriği `foreignColumns`'u
 * eşlenmiş bir tip (`ColumnsWithTable<...>`) üzerinden çıkarmaya çalışıyor. Bu
 * şemadaki bileşik FK'lerle birlikte tsc bellek taşırıyor
 * ("FATAL ERROR: Zone Allocation failed - process out of memory") — yani
 * `bun run typecheck` hiç bitmiyor. Sarmalayıcı imzayı düz `PgColumn[]`'a
 * indirip o çıkarımı kesiyor.
 *
 * KAYIP: yalnızca "verilen `foreignColumns` gerçekten tek ve aynı tablodan mı"
 * derleme zamanı kontrolü. Çalışma zamanı davranışı birebir aynı — `foreignKey`
 * kolon nesnelerinin kendisini okur. Hata yaparsan sessizce geçmez ama tsc yerine
 * bir adım sonra, `db:generate`/`db:migrate` aşamasında ortaya çıkar.
 */
export const compositeForeignKey = (config: {
  name: string;
  columns: t.PgColumn[];
  foreignColumns: t.PgColumn[];
}) => t.foreignKey(config as never);
