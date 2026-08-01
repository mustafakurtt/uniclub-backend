import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { createdAtColumn } from "./helpers";
import { universities } from "./university";
import { clubs } from "./clubs";
import { activities } from "./activities";
import { users } from "./users";
import { compositeForeignKey } from "./helpers";

export const posterQrStatusEnum = pgEnum("poster_qr_status", ["active", "cancelled"]);

export const posterQrTargetTypeEnum = pgEnum("poster_qr_target_type", ["club", "activity"]);

/**
 * Afiş/tanıtım QR kodları — kısa kod sabit, hedef sonradan güncellenebilir.
 */
export const posterQrCodes = table(
  "poster_qr_codes",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    universityId: t
      .uuid("university_id")
      .references(() => universities.id, { onDelete: "restrict" })
      .notNull(),
    /** Kamuya açık çözümleme anahtarı — tahmin edilemez (crypto random). */
    code: t.varchar({ length: 32 }).notNull().unique(),
    status: posterQrStatusEnum().default("active").notNull(),
    /** Kanal etiketi: "A blok panosu", "kantin" — aynı hedef için çoklu kod. */
    sourceLabel: t.varchar("source_label", { length: 128 }).notNull(),
    targetType: posterQrTargetTypeEnum("target_type").notNull(),
    targetClubId: t.uuid("target_club_id").references(() => clubs.id, { onDelete: "restrict" }),
    targetActivityId: t.uuid("target_activity_id").references(() => activities.id, { onDelete: "cascade" }),
    validFrom: t.timestamp("valid_from", { withTimezone: true }),
    validUntil: t.timestamp("valid_until", { withTimezone: true }),
    scanCount: t.integer("scan_count").default(0).notNull(),
    createdBy: t.uuid("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
    ...timestamps,
  },
  (cols) => [
    compositeForeignKey({
      name: "poster_qr_codes_club_tenant_fkey",
      columns: [cols.targetClubId, cols.universityId],
      foreignColumns: [clubs.id, clubs.universityId],
    }).onDelete("restrict"),
  ]
);

/** Tarama zaman dağılımı — append-only. */
export const posterQrScans = table(
  "poster_qr_scans",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    qrCodeId: t
      .uuid("qr_code_id")
      .references(() => posterQrCodes.id, { onDelete: "cascade" })
      .notNull(),
    scannedAt: t.timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
    ...createdAtColumn,
  },
  (cols) => [
    t.index("poster_qr_scans_qr_code_id_scanned_at_idx").on(cols.qrCodeId, cols.scannedAt),
  ]
);
