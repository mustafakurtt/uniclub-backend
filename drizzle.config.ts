import { defineConfig } from "drizzle-kit";

// Not: drizzle-kit çalışırken src/config/env.ts'yi doğrudan okuyamayabilir, 
// bu yüzden yerleşik dotenv yükleyicisini veya direkt process.env'yi kullanıyoruz.
export default defineConfig({
  schema: "./src/db/schema.ts",   // Şemamızın yeri
  out: "./src/db/migrations",     // SQL dosyalarının üretileceği yer
  dialect: "postgresql",          // Veritabanı türü
  dbCredentials: {
    url: process.env.DATABASE_URL!, 
  },
  verbose: true,
  strict: true,
});