import { describe, it, expect } from "bun:test";
import { app, postJson } from "./helpers";
import { SEED_PASSWORD } from "./config";
import { emailQueue, type PasswordResetEmailJob, type VerificationEmailJob } from "../src/features/auth/auth.queue";

// Test veritabanı her koşuda sıfırdan seed'lendiği için (bkz. provision.ts)
// bu senaryolar deterministiktir — yeni kayıt "zaten var" hatası vermez.
describe("auth: kayıt ve giriş", () => {
  it("bilinen bir e-posta domaininden kayıt kabul edilir (tenant domainden çıkarılır)", async () => {
    const res = await postJson("/api/auth/register", {
      firstName: "Yeni",
      lastName: "Kullanici",
      email: "yeni.kayit@std.antalya.edu.tr",
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(201);
    expect((await res.json()).success).toBe(true);
  });

  it("tanınmayan domainden kayıt reddedilir (üniversite sorulmaz)", async () => {
    const res = await postJson("/api/auth/register", {
      firstName: "Bilinmeyen",
      lastName: "Domain",
      email: "biri@bilinmeyen-universite.com",
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it("var olan bir e-postayla ikinci kayıt reddedilir", async () => {
    const res = await postJson("/api/auth/register", {
      firstName: "Mustafa",
      lastName: "Kurt",
      email: "mustafa.kurt@std.antalya.edu.tr", // seed'de mevcut
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  it("doğru kimlik bilgisiyle giriş bir JWT döner", async () => {
    const res = await postJson("/api/auth/login", {
      email: "mustafa.kurt@std.antalya.edu.tr",
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).token).toBe("string");
  });

  it("yanlış şifre 401 döner", async () => {
    const res = await postJson("/api/auth/login", {
      email: "mustafa.kurt@std.antalya.edu.tr",
      password: "yanlis-sifre",
    });
    expect(res.status).toBe(401);
  });

  it("bilinmeyen e-posta 401 döner (kullanıcı varlığı sızdırılmaz)", async () => {
    const res = await postJson("/api/auth/login", {
      email: "olmayan@std.antalya.edu.tr",
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it("askıya alınmış (suspended) hesabın girişi 401 ile engellenir", async () => {
    const res = await postJson("/api/auth/login", {
      email: "fatma.sahin@std.antalya.edu.tr", // seed'de status: suspended
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me token olmadan 401 döner", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

// E-posta büyük/küçük harf normalizasyonu (bkz. docs/planning/schema-product.md §0.1).
// Normalize edilmezse "Ali@x" ile "ali@x" aynı kişi için İKİ hesap açardı ve login
// yanlış satıra düşerdi; tekillik index'i harfe duyarlıdır.
describe("auth: e-posta büyük/küçük harf normalizasyonu", () => {
  it("kayıt sırasında e-posta küçük harfe indirgenir (giriş küçük harfle çalışır)", async () => {
    const res = await postJson("/api/auth/register", {
      firstName: "Buyuk",
      lastName: "Harf",
      email: "  BuYuK.Harf@STD.Antalya.EDU.TR  ",
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(201);

    const login = await postJson("/api/auth/login", {
      email: "buyuk.harf@std.antalya.edu.tr",
      password: SEED_PASSWORD,
    });
    expect(login.status).toBe(200);
  });

  it("aynı e-postanın farklı harf yazımıyla ikinci kayıt reddedilir", async () => {
    const res = await postJson("/api/auth/register", {
      firstName: "Mustafa",
      lastName: "Kurt",
      email: "Mustafa.KURT@std.Antalya.edu.tr", // seed'de küçük harfle mevcut
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  it("büyük harfle yazılan e-posta ile giriş yapılabilir", async () => {
    const res = await postJson("/api/auth/login", {
      email: "MUSTAFA.KURT@STD.ANTALYA.EDU.TR",
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(200);
  });

  it("büyük harfli domain de tanınır (tenant çıkarımı domainden yapılır)", async () => {
    const res = await postJson("/api/auth/register", {
      firstName: "Domain",
      lastName: "Buyuk",
      email: "domain.buyuk@STD.ANTALYA.EDU.TR",
      password: SEED_PASSWORD,
    });
    expect(res.status).toBe(201);
  });
});

describe("auth: şifre sıfırlama", () => {
  async function getVerificationTokenForEmail(email: string): Promise<string> {
    const jobs = await emailQueue.getJobs(["waiting", "delayed", "active", "completed"]);
    const job = jobs.find(
      (j) => j.name === "send-verify-email" && (j.data as VerificationEmailJob).email === email
    );
    expect(job).toBeDefined();
    return (job!.data as VerificationEmailJob).token;
  }

  async function getPasswordResetTokenForEmail(email: string): Promise<string> {
    const jobs = await emailQueue.getJobs(["waiting", "delayed", "active", "completed"]);
    const job = jobs.find(
      (j) => j.name === "send-password-reset" && (j.data as PasswordResetEmailJob).email === email
    );
    expect(job).toBeDefined();
    return (job!.data as PasswordResetEmailJob).token;
  }

  it("aynı token ile eşzamanlı iki şifre sıfırlama — biri 200 diğeri 400", async () => {
    const email = `reset.concurrent.${Date.now()}@std.antalya.edu.tr`;
    expect(
      (
        await postJson("/api/auth/register", {
          firstName: "Reset",
          lastName: "Concurrent",
          email,
          password: SEED_PASSWORD,
        })
      ).status
    ).toBe(201);

    const verifyToken = await getVerificationTokenForEmail(email);
    expect((await app.request(`/api/auth/verify?token=${verifyToken}`)).status).toBe(200);

    expect((await postJson("/api/auth/forgot-password", { email })).status).toBe(200);
    const resetToken = await getPasswordResetTokenForEmail(email);
    const newPassword = "ConcurrentReset12!";
    const body = JSON.stringify({ token: resetToken, password: newPassword });
    const opts = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    };
    const [first, second] = await Promise.all([
      app.request("/api/auth/reset-password", opts),
      app.request("/api/auth/reset-password", opts),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 400]);
    const failed = first.status === 400 ? first : second;
    expect((await failed.json()).message).toContain("kullanılmış");
  });
});
