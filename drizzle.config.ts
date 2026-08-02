import { defineConfig } from "drizzle-kit";

// Not: drizzle-kit çalışırken src/config/env.ts'yi doğrudan okuyamayabilir, 
// bu yüzden yerleşik dotenv yükleyicisini veya direkt process.env'yi kullanıyoruz.
export default defineConfig({
  // index.ts barrel export'u hariç — aksi halde tablolar çift tanımlanır.
  schema: [
    "./src/db/schema/university.ts",
    "./src/db/schema/users.ts",
    "./src/db/schema/rbac.ts",
    "./src/db/schema/clubs.ts",
    "./src/db/schema/announcements.ts",
    "./src/db/schema/notifications.ts",
    "./src/db/schema/approval-committees.ts",
    "./src/db/schema/applications.ts",
    "./src/db/schema/club-formation.ts",
    "./src/db/schema/audit.ts",
    "./src/db/schema/activities.ts",
    "./src/db/schema/social-preview.ts",
    "./src/db/schema/media.ts",
    "./src/db/schema/invitations.ts",
    "./src/db/schema/tenant-settings.ts",
    "./src/db/schema/poster-qr.ts",
    "./src/db/schema/academic-terms.ts",
    "./src/db/schema/membership-events.ts",
    "./src/db/schema/advisor-invitations.ts",
    "./src/db/schema/general-meetings.ts",
    "./src/db/schema/handover.ts",
    "./src/db/schema/approval-committees.ts",
  ],
  out: "./src/db/migrations",     // SQL dosyalarının üretileceği yer
  dialect: "postgresql",          // Veritabanı türü
  dbCredentials: {
    url: process.env.DATABASE_URL!, 
  },
  verbose: true,
  strict: true,
});