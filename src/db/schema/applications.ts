import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { compositeForeignKey } from "./helpers";

// ═══════════════════════════════════════════════
// CLUB APPLICATIONS + GENİŞLETİLEBİLİR ONAY ZİNCİRİ
// ═══════════════════════════════════════════════
export const applicationStatusEnum = pgEnum("application_status", ["pending", "approved", "rejected"]);
export const applicationApprovalStatusEnum = pgEnum("application_approval_status", ["pending", "approved", "rejected"]);

export const clubApplications = table("club_applications", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),

  proposedName: t.varchar("proposed_name", { length: 256 }).notNull(),
  description: t.text(),
  applicantId: t.uuid("applicant_id").notNull(),

  status: applicationStatusEnum().default("pending").notNull(), // özet durum, approvals adımlarından türetilir
  ...timestamps,
}, (cols) => [
  // Başvuran, başvurduğu üniversitenin kullanıcısı OLMAK ZORUNDA. Akış zaten
  // `requireTenant()` ile korunuyor (bkz. clubs/routes/applications.routes.ts),
  // bu kısıt onu DB'de kalıcı kılar.
  // Not: `clubApplicationApprovals.approverId` bilinçli olarak kilitlenmedi —
  // bir platform hesabının (super_admin) onay adımına düşmesi meşru bir senaryo.
  compositeForeignKey({
    columns: [cols.applicantId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_applications_applicant_tenant_fkey",
  }).onDelete("restrict"),
  // Yönetim panelindeki başvuru listesi (tenant + duruma göre filtre).
  t.index("club_applications_university_status_idx").on(cols.universityId, cols.status),
  // "Başvurularım".
  t.index("club_applications_applicant_idx").on(cols.applicantId),
]);

// Her onay adımı ayrı bir satır. Şimdilik tek adım (step: 1) kullanılacak,
// ileride SKS gibi ikinci bir onay eklemek için sadece step: 2 satırı eklenir — şema değişmez.
export const clubApplicationApprovals = table("club_application_approvals", {
  id: t.uuid().primaryKey().defaultRandom(),
  applicationId: t.uuid("application_id")
    .references(() => clubApplications.id, { onDelete: "cascade" })
    .notNull(),

  step: t.integer().notNull(), // 1: danışman, 2: SKS (ileride)...
  // Karar verici belirteci — tenant zincirindeki rol veya `club_approver` (club.approve yetkisi).
  // Çok kademede gerçek yetki kapısı; eski tek adımlı "advisor" satırları kod/migration ile uyumlu tutulur.
  approverRole: t.varchar("approver_role", { length: 100 }),
  approverId: t.uuid("approver_id").references(() => users.id, { onDelete: "set null" }), // gerçekte onaylayan kişi

  status: applicationApprovalStatusEnum().default("pending").notNull(),
  /**
   * Karar gerekçesi. Reddederken ZORUNLU (API katmanında): öğrenci başvurusunun
   * neden reddedildiğini bilmeden düzeltip yeniden başvuramaz — ve gerekçesiz
   * ret, denetlenebilir bir karar değildir. Onayda serbest (opsiyonel not).
   */
  note: t.text(),
  reviewedAt: t.timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (cols) => [
  t.uniqueIndex("application_step_idx").on(cols.applicationId, cols.step),
]);
