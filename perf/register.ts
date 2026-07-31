/**
 * KAYIT SELİ senaryosu — "büyük bir yayıncı siteyi gösterdi, herkes aynı anda
 * kayıt olmaya çalışıyor".
 *
 * `run.ts`ten AYRI durur çünkü kayıt bir YAZMA yoludur ve tamamen farklı bir
 * darboğaza sahiptir: bcrypt. Okuma senaryolarıyla aynı tabloda göstermek
 * yanıltıcı olurdu.
 *
 * İki yol AYRI ölçülür, çünkü gerçek bir selde ikisi de olur ve maliyetleri
 * arasında büyüklük farkı vardır:
 *
 *   A) REDDEDİLEN kayıt — e-posta domaini hiçbir üniversiteye ait değil
 *      (gmail.com, hotmail.com…). Sistem 2. adımda durur: tek DB sorgusu,
 *      bcrypt YOK. Rastgele internet kullanıcılarının EZİCİ ÇOĞUNLUĞU buraya düşer.
 *
 *   B) BAŞARILI kayıt — tanınan bir okul domaini. Tam yol: domain sorgusu +
 *      e-posta tekrarı sorgusu + **bcrypt** + kullanıcı/rol insert (transaction)
 *      + doğrulama maili kuyruğa.
 *
 * ⚠️ B senaryosu GERÇEK KAYIT OLUŞTURUR. Bu yüzden `PERF_BASE_URL`in gösterdiği
 * sunucu TEST veritabanına bağlı olmalıdır (uniclub_test) — `bun run test:setup`
 * onu zaten sıfırlar.
 */
import { runScenario, waitForServer, printTable, type LoadResult } from "./load";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3100";
const CONNECTIONS = (process.env.PERF_CONNECTIONS ?? "50").split(",").map(Number);
const DURATION = Number(process.env.PERF_DURATION ?? 6);

/** Seed'de tanımlı öğrenci domaini (bkz. src/db/seed.ts). */
const VALID_DOMAIN = "std.antalya.edu.tr";

let counter = 0;
const uniqueEmail = (domain: string) => `perf${Date.now()}x${counter++}@${domain}`;

const body = (email: string) =>
  JSON.stringify({
    email,
    password: "Password123!",
    firstName: "Yuk",
    lastName: "Testi",
  });

const post = (email: string) => ({
  url: `${BASE_URL}/api/auth/register`,
  init: {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body(email),
  },
});

async function main() {
  console.log(`hedef       : ${BASE_URL}`);
  console.log(`eşzamanlılık: ${CONNECTIONS.join(", ")} · süre: ${DURATION} sn/senaryo`);
  console.log(`⚠️  B senaryosu gerçek kayıt oluşturur — sunucu TEST DB'sine bağlı olmalı\n`);

  await waitForServer(BASE_URL);

  const results: LoadResult[] = [];
  for (const connections of CONNECTIONS) {
    results.push(
      await runScenario(
        {
          name: "A. reddedilen kayıt (bilinmeyen domain)",
          request: () => post(uniqueEmail("gmail.com")),
          expectStatus: 400,
        },
        { connections, durationSeconds: DURATION }
      )
    );
    results.push(
      await runScenario(
        {
          name: "B. başarılı kayıt (bcrypt + insert)",
          request: () => post(uniqueEmail(VALID_DOMAIN)),
          expectStatus: 201,
        },
        { connections, durationSeconds: DURATION }
      )
    );
  }

  console.log(" ".repeat(70));
  printTable(results);

  const success = results.filter((r) => r.scenario.startsWith("B"));
  if (success.length > 0) {
    const best = Math.max(...success.map((r) => r.rps));
    console.log(`\nEn yüksek kayıt hızı: ${best.toFixed(0)} kayıt/sn`);
    console.log(`→ 100 000 kayıt ≈ ${(100_000 / best / 60).toFixed(0)} dakika sürerdi.`);
  }
}

await main();
process.exit(0);
