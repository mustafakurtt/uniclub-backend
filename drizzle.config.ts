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
    "./src/db/schema/applications.ts",
    "./src/db/schema/audit.ts",
    "./src/db/schema/activities.ts",
    "./src/db/schema/media.ts",
  ],
  out: "./src/db/migrations",     // SQL dosyalarının üretileceği yer
  dialect: "postgresql",          // Veritabanı türü
  dbCredentials: {
    url: process.env.DATABASE_URL!, 
  },
  verbose: true,
  strict: true,
});