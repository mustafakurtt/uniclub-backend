import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { timestamps, softDeleteColumn } from "../../core/db/base.entity";

// ═══════════════════════════════════════════════
// UNIVERSITIES & DOMAINS (Tenant + çoklu domain desteği)
// ═══════════════════════════════════════════════

/** SaaS tenant yaşam döngüsü (bkz. docs/planning/schema-product.md §2.1). */
export const universityStatusEnum = pgEnum("university_status", [
  "trial",
  "active",
  "past_due",
  "suspended",
]);

export const universities = table("universities", {
  id: t.uuid().primaryKey().defaultRandom(),
  name: t.varchar({ length: 256 }).notNull(),
  slug: t.varchar({ length: 256 }).notNull().unique(), // ileride SaaS subdomain için: xyz-universitesi.uygulaman.com
  status: universityStatusEnum().default("active").notNull(),
  ...timestamps,
  ...softDeleteColumn,
});

export const universityDomains = table("university_domains", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "cascade" })
    .notNull(),
  domain: t.varchar({ length: 256 }).notNull().unique(), // "ogrenci.xyz.edu.tr", "xyz.edu.tr" gibi birden fazla olabilir
  domainType: t.varchar("domain_type", { length: 50 }).default("student").notNull(),
  ...timestamps,
  ...softDeleteColumn,
}, (cols) => [
  // Kayıt akışı tenant'ı e-postanın domain'inden bulur. Domain büyük harfle
  // yazılırsa eşleşme kaçar ve "domain kayıtlı değil" hatası alınır. Uygulama
  // katmanı küçük harfe çeviriyor; bu kısıt onu unutan bir yolu da kapatır.
  t.check("university_domains_domain_lowercase", sql`${cols.domain} = lower(${cols.domain})`),
]);

// ═══════════════════════════════════════════════
// FACULTIES & DEPARTMENTS (Üniversite > Fakülte > Bölüm)
// ═══════════════════════════════════════════════
export const faculties = table("faculties", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),
  name: t.varchar({ length: 256 }).notNull(), // "Mühendislik Fakültesi"
  ...timestamps,
  ...softDeleteColumn,
});

export const departments = table("departments", {
  id: t.uuid().primaryKey().defaultRandom(),
  facultyId: t.uuid("faculty_id")
    .references(() => faculties.id, { onDelete: "restrict" })
    .notNull(),
  name: t.varchar({ length: 256 }).notNull(), // "Bilgisayar Mühendisliği"
  ...timestamps,
  ...softDeleteColumn,
});
// Not: departments.universityId kasıtlı olarak eklenmedi.
// Bilgiye faculty -> university zinciriyle ulaşılır, tekrar (redundancy) yaratmamak için.
