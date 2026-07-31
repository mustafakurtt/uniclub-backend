import { pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";

// ═══════════════════════════════════════════════
// TENANT ADMIN INVITATIONS (operatör daveti — şifre operatörde yaşamaz)
// ═══════════════════════════════════════════════

export const tenantAdminInvitations = table("tenant_admin_invitations", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "cascade" })
    .notNull(),
  email: t.varchar({ length: 256 }).notNull(),
  firstName: t.varchar("first_name", { length: 100 }).notNull(),
  lastName: t.varchar("last_name", { length: 100 }).notNull(),
  roleName: t.varchar("role_name", { length: 100 }).notNull(),
  /** SHA-256 özeti (64 hex) — düz token yalnızca mailde. */
  tokenHash: t.varchar("token_hash", { length: 64 }).notNull().unique(),
  /** FK users.id — migration'da ON DELETE SET NULL (şema döngüsü nedeniyle burada referans yok). */
  invitedBy: t.uuid("invited_by"),
  expiresAt: t.timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  acceptedAt: t.timestamp("accepted_at", { withTimezone: true, mode: "date" }),
  cancelledAt: t.timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
  ...timestamps,
}, (cols) => [
  t.index("tenant_admin_invitations_university_idx").on(cols.universityId),
  t.index("tenant_admin_invitations_email_idx").on(cols.email),
]);
