import { pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { universities } from "./university";
import { users } from "./users";
import { createdAtColumn } from "./helpers";

// ═══════════════════════════════════════════════
// AUDIT LOGS (append-only denetim izi)
// ═══════════════════════════════════════════════
// "Bu kullanıcıyı kim askıya aldı? Bu kulübü kim onayladı?" sorularının cevabı.
// Kayıtlar guard() zincirindeki auditTrail tarafından otomatik yazılır
// (bkz. core/rbac/audit-hook.ts + features/audit/audit.sink.ts).
// Append-only: satır asla güncellenmez → updatedAt bilinçli olarak YOK.
// FK'ler restrict: denetim izi bir kayıttır, başka bir satırın silinmesinin
// yan etkisiyle kaybolamaz/anonimleşemez.
export const auditLogs = table("audit_logs", {
  id: t.uuid().primaryKey().defaultRandom(),
  // null = platform seviyesi işlem (tenant'sız super_admin aksiyonu, örn. üniversite oluşturma).
  universityId: t.uuid("university_id").references(() => universities.id, { onDelete: "restrict" }),
  actorId: t.uuid("actor_id").references(() => users.id, { onDelete: "restrict" }).notNull(),

  // İşlemin yetki anahtarı ("user.manage", "club.approve"...) — permission key ile aynı uzay.
  // pgEnum DEĞİL (notifications.type ile aynı gerekçe): yeni anahtar migration istememeli.
  action: t.varchar({ length: 128 }).notNull(),
  method: t.varchar({ length: 8 }).notNull(),
  path: t.varchar({ length: 512 }).notNull(),
  // HTTP yanıt kodu: 2xx başarılı işlem, 4xx reddedilmiş DENEME (o da denetim izidir).
  status: t.integer().notNull(),

  targetType: t.varchar("target_type", { length: 64 }), // "user", "club", "club_application"...
  targetId: t.varchar("target_id", { length: 128 }),
  // Serbest bağlam: { params, body } — hassas alanlar (şifre vb.) sink'te maskelenir.
  metadata: t.jsonb().$type<Record<string, unknown>>(),
  ip: t.varchar({ length: 64 }),

  ...createdAtColumn,
}, (cols) => [
  // Tenant'ın denetim akışı (en yeniden eskiye) — keyset sayfalama bunu kullanır.
  t.index("audit_logs_university_created_idx").on(cols.universityId, cols.createdAt.desc()),
  // "Bu aktör neler yaptı?" filtresi.
  t.index("audit_logs_actor_created_idx").on(cols.actorId, cols.createdAt.desc()),
  // "Bu kaynağa kimler dokundu?" filtresi.
  t.index("audit_logs_target_idx").on(cols.targetType, cols.targetId),
]);
