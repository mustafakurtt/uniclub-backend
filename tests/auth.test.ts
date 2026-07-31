import { describe, it, expect } from "bun:test";
import { app, postJson } from "./helpers";
import { SEED_PASSWORD } from "./config";

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
