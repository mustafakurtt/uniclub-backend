/**
 * KVKK anonimleştirme (bkz. docs/planning/schema-product.md §1.2).
 *
 * Sınanan sözleşme üç parçalı:
 *   1. Kimliği tanımlayan alanlar gerçekten maskeleniyor mu,
 *   2. KAYITLAR (denetim izi, moderasyon geçmişi) ayakta kalıyor mu — silme
 *      değil anonimleştirme yapmamızın tek sebebi bu,
 *   3. Hesap gerçekten ölü mü: giriş yapamıyor, yetki taşımıyor.
 *
 * Uçtan uca HTTP üzerinden koşar (guard zinciri + tenant scope dahil), sonra
 * satırın son halini DB'den doğrular.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { app, login, me } from "./helpers";
import { SEED_PASSWORD } from "./config";
import { db } from "../src/db";

const ANONYMIZE_BODY = { reason: "KVKK silme talebi #2026-001", confirm: "ANONIMLESTIR" };

/** Test için taze bir kullanıcı yaratır (seed senaryolarını bozmamak için). */
async function registerFreshUser(localPart: string) {
  const email = `${localPart}@std.antalya.edu.tr`;
  const res = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      firstName: "Anonim",
      lastName: "Adayı",
      email,
      password: SEED_PASSWORD,
    }),
  });
  expect(res.status).toBe(201);
  const user = await db.query.users.findFirst({ where: { email } });
  return { email, user: user! };
}

const post = (path: string, token: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

describe("KVKK anonimleştirme", () => {
  let admin: string;
  let uni: string;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr"); // university_admin (Antalya)
    uni = (await me(admin)).universityId as string;
  });

  const anonymizeUrl = (userId: string) =>
    `/api/moderation/universities/${uni}/users/${userId}/anonymize`;

  it("onay kelimesi olmadan reddedilir (tek tıklık kaza olmasın)", async () => {
    const { user } = await registerFreshUser("anon.onaysiz");
    const res = await post(anonymizeUrl(user.id), admin, { reason: "KVKK silme talebi #x" });
    expect(res.status).toBe(400);

    // Hesap dokunulmamış olmalı.
    const after = await db.query.users.findFirst({ where: { id: user.id } });
    expect(after!.deletedAt).toBeNull();
  });

  it("kısa gerekçe reddedilir (denetim izinin tek dayanağı)", async () => {
    const { user } = await registerFreshUser("anon.kisagerekce");
    const res = await post(anonymizeUrl(user.id), admin, { reason: "sil", confirm: "ANONIMLESTIR" });
    expect(res.status).toBe(400);
  });

  it("kimliği tanımlayan alanlar maskelenir, hesap silinmiş işaretlenir", async () => {
    const { email, user } = await registerFreshUser("anon.basarili");

    const res = await post(anonymizeUrl(user.id), admin, ANONYMIZE_BODY);
    expect(res.status).toBe(200);

    const after = (await db.query.users.findFirst({ where: { id: user.id } }))!;
    expect(after.deletedAt).not.toBeNull();
    expect(after.email).not.toBe(email);
    expect(after.email).toBe(`silinmis-${user.id}@anonim.invalid`);
    expect(after.firstName).toBe("Silinmiş");
    expect(after.studentNumber).toBeNull();
    expect(after.photoUrl).toBeNull();
    // Şifre hash'i değişmiş olmalı: deletedAt kontrolü bir gün atlanırsa bile
    // o hesaba girilebilecek bir parola kalmasın.
    expect(after.passwordHash).not.toBe(user.passwordHash);
    // Satır DURUYOR — silme değil anonimleştirme yaptığımızın kanıtı.
    expect(after.id).toBe(user.id);
  });

  it("anonimleştirme moderasyon geçmişine düşer (kim, ne zaman, neden)", async () => {
    const { user } = await registerFreshUser("anon.gecmis");
    expect((await post(anonymizeUrl(user.id), admin, ANONYMIZE_BODY)).status).toBe(200);

    const history = await db.query.userModerationActions.findFirst({
      where: { userId: user.id, action: "anonymize" },
    });
    expect(history).toBeTruthy();
    expect(history!.reason).toBe(ANONYMIZE_BODY.reason);
  });

  it("anonimleştirilmiş hesap giriş YAPAMAZ", async () => {
    const { email, user } = await registerFreshUser("anon.giris");
    expect((await post(anonymizeUrl(user.id), admin, ANONYMIZE_BODY)).status).toBe(200);

    // Eski e-posta artık hiçbir satıra ait değil.
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: SEED_PASSWORD }),
    });
    expect(res.status).toBe(401);
  });

  it("anonimleştirilmiş hesabın ELİNDEKİ token'ı da geçersizleşir", async () => {
    const { email, user } = await registerFreshUser("anon.token");
    // Önce giriş yapıp geçerli bir token al — anonimleştirme SONRASI hâlâ
    // çalışıyor mu diye bakacağız (authz cache invalidation'ın kanıtı).
    const token = await login(email);
    expect((await app.request("/api/users/me/permissions", {
      headers: { authorization: `Bearer ${token}` },
    })).status).toBe(200);

    expect((await post(anonymizeUrl(user.id), admin, ANONYMIZE_BODY)).status).toBe(200);

    // Aynı token, aynı istek → artık reddedilmeli.
    const after = await app.request("/api/users/me/permissions", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(403);
  });

  it("aynı hesap ikinci kez anonimleştirilemez", async () => {
    const { user } = await registerFreshUser("anon.ikinci");
    expect((await post(anonymizeUrl(user.id), admin, ANONYMIZE_BODY)).status).toBe(200);
    expect((await post(anonymizeUrl(user.id), admin, ANONYMIZE_BODY)).status).toBe(400);
  });

  it("yönetici kendi hesabını anonimleştiremez", async () => {
    const adminId = (await me(admin)).userId;
    const res = await post(anonymizeUrl(adminId), admin, ANONYMIZE_BODY);
    expect(res.status).toBe(400);
  });

  it("başka tenant'ın yöneticisi bu kullanıcıya uzanamaz (tenant scope)", async () => {
    const { user } = await registerFreshUser("anon.baskatenant");
    const egeAdmin = await login("okan.yildiz@egebilim.edu.tr");
    const res = await post(anonymizeUrl(user.id), egeAdmin, ANONYMIZE_BODY);
    expect(res.status).toBe(403);

    const after = await db.query.users.findFirst({ where: { id: user.id } });
    expect(after!.deletedAt).toBeNull();
  });
});
