/**
 * Çapraz-tenant kilidi — VERİTABANI seviyesinde (bkz. docs/SEMA_VE_URUN_YOL_HARITASI.md §1.1).
 *
 * Diğer tenant izolasyon testleri (rbac.test.ts) HTTP katmanını sınar: "başka
 * üniversitenin kaynağına uzanan istek 403 alır mı". Bu dosya farklı bir soruyu
 * sorar: **uygulama katmanı atlanırsa ne olur?** Yani servis katmanında bir hata
 * olsa, ya da yarın biri doğrudan repository'den yazsa, veritabanı bunu durdurur mu.
 *
 * Bu yüzden testler bilinçli olarak `app.request()` değil, doğrudan `db` kullanır —
 * korunması gereken şey burada kısıtın kendisi, rotanın davranışı değil.
 */
import { describe, it, expect } from "bun:test";
import { isNull } from "drizzle-orm";
import { db } from "../src/db";
import * as schema from "../src/db/schema";

/**
 * Verilen yazmanın veritabanı tarafından reddedildiğini doğrular ve HANGİ kısıtın
 * tetiklendiğini de sınar — "bir şekilde hata verdi" yeterli değil, doğru kilidin
 * kapandığını görmek istiyoruz.
 *
 * Not: `expect(...).rejects` kullanılmıyor; drizzle sorgu kurucusu gerçek bir
 * Promise değil, thenable — `.rejects` onu tanımıyor.
 */
async function expectConstraintViolation(run: () => Promise<unknown>, constraint: string) {
  let message = "";
  try {
    await run();
  } catch (error) {
    // Postgres'in kısıt adı hata zincirinin `cause`'unda yaşıyor.
    for (let e: unknown = error; e instanceof Error; e = (e as { cause?: unknown }).cause) {
      message += ` ${e.message}`;
    }
  }
  if (!message) throw new Error(`yazma reddedilmedi — beklenen kısıt: ${constraint}`);
  expect(message).toContain(constraint);
}

/** Seed'den iki farklı üniversiteden birer kulüp ve kullanıcı toplar. */
async function fixtures() {
  const antalya = await db.query.universities.findFirst({ where: { slug: "antalya-bilim" } });
  const ege = await db.query.universities.findFirst({ where: { slug: "ege-bilim" } });
  if (!antalya || !ege) throw new Error("seed üniversiteleri bulunamadı");

  const antalyaClub = await db.query.clubs.findFirst({ where: { universityId: antalya.id } });
  const egeUser = await db.query.users.findFirst({ where: { universityId: ege.id } });
  // Platform hesabı: `where: { universityId: null }` ilişkisel API'de desteklenmiyor
  // (null'ı filtre nesnesi sanıp patlıyor) — ham select ile IS NULL.
  const [platformUser] = await db
    .select()
    .from(schema.users)
    .where(isNull(schema.users.universityId))
    .limit(1);
  if (!antalyaClub || !egeUser || !platformUser) throw new Error("seed kayıtları eksik");

  return { antalya, ege, antalyaClub, egeUser, platformUser };
}

describe("çapraz-tenant kilidi: kulüp üyeliği", () => {
  it("başka üniversitenin kullanıcısı bir kulübe üye YAZILAMAZ", async () => {
    const { antalyaClub, egeUser } = await fixtures();

    // Satırın tenant'ı kulüple tutarlı ama kullanıcı başka tenant'tan →
    // club_members_user_tenant_fkey ihlali.
    await expectConstraintViolation(
      () =>
        db.insert(schema.clubMembers).values({
          clubId: antalyaClub.id,
          userId: egeUser.id,
          universityId: antalyaClub.universityId,
          role: "member",
          status: "approved",
        }),
      "club_members_user_tenant_fkey"
    );
  });

  it("satırın tenant'ı kulübünkiyle uyuşmazsa yazılamaz", async () => {
    const { antalyaClub, ege } = await fixtures();
    const egeUser = (await db.query.users.findFirst({ where: { universityId: ege.id } }))!;

    // Bu sefer kullanıcıyla tutarlı ama kulüple tutarsız →
    // club_members_club_tenant_fkey ihlali. İki FK aynı kolonu paylaştığı için
    // "hangi tarafı seçersen seç" kaçış yolu yok.
    await expectConstraintViolation(
      () =>
        db.insert(schema.clubMembers).values({
          clubId: antalyaClub.id,
          userId: egeUser.id,
          universityId: ege.id,
          role: "member",
          status: "approved",
        }),
      "club_members_club_tenant_fkey"
    );
  });

  it("platform hesabı (tenant'sız) hiçbir kulübe üye olamaz", async () => {
    const { antalyaClub, platformUser } = await fixtures();

    // users.university_id NULL olduğu için (id, university_id) çifti hiçbir
    // tenant-bağlı satırla eşleşmez — kasıtlı sonuç.
    await expectConstraintViolation(
      () =>
        db.insert(schema.clubMembers).values({
          clubId: antalyaClub.id,
          userId: platformUser.id,
          universityId: antalyaClub.universityId,
          role: "member",
          status: "approved",
        }),
      "club_members_user_tenant_fkey"
    );
  });

  it("aynı tenant içindeki üyelik normal şekilde yazılır (kilit meşru yolu kapatmıyor)", async () => {
    const { antalyaClub, antalya } = await fixtures();
    const antalyaUser = await db.query.users.findFirst({
      where: { universityId: antalya.id, status: "active" },
    });
    if (!antalyaUser) throw new Error("seed'de aktif Antalya kullanıcısı yok");

    const existing = await db.query.clubMembers.findFirst({
      where: { clubId: antalyaClub.id, userId: antalyaUser.id },
    });
    if (existing) {
      // Zaten üyeyse kilit açısından kanıt değeri yok; satırın tenant'ı doğru mu ona bak.
      expect(existing.universityId).toBe(antalyaClub.universityId);
      return;
    }

    const [inserted] = await db
      .insert(schema.clubMembers)
      .values({
        clubId: antalyaClub.id,
        userId: antalyaUser.id,
        universityId: antalyaClub.universityId,
        role: "member",
        status: "approved",
      })
      .returning();

    expect(inserted.universityId).toBe(antalyaClub.universityId);
  });
});

describe("çapraz-tenant kilidi: danışman ve içerik", () => {
  it("başka üniversitenin hocası danışman YAPILAMAZ", async () => {
    const { antalyaClub, egeUser } = await fixtures();

    await expectConstraintViolation(
      () =>
        db.insert(schema.clubAdvisors).values({
          clubId: antalyaClub.id,
          userId: egeUser.id,
          universityId: antalyaClub.universityId,
        }),
      "club_advisors_user_tenant_fkey"
    );
  });

  it("duyurunun denormalize universityId'si kulübünkinden SAPAMAZ", async () => {
    const { antalyaClub, ege } = await fixtures();
    const author = await db.query.users.findFirst({
      where: { universityId: antalyaClub.universityId },
    });

    // Eskiden iki ayrı tekil FK vardı ve birbirini kontrol etmiyordu: bu satır
    // sessizce yazılır, sonra "Ege'nin duyuruları" listesinde Antalya kulübünün
    // duyurusu görünürdü.
    await expectConstraintViolation(
      () =>
        db.insert(schema.announcements).values({
          clubId: antalyaClub.id,
          universityId: ege.id,
          authorId: author!.id,
          title: "Sapmış tenant",
          content: "Bu satır yazılabilmemeli.",
        }),
      "announcements_club_tenant_fkey"
    );
  });

  it("galeri görseli başka tenant'ın kulübüne bağlanamaz", async () => {
    const { antalyaClub, ege } = await fixtures();
    const uploader = await db.query.users.findFirst({
      where: { universityId: antalyaClub.universityId },
    });

    await expectConstraintViolation(
      () =>
        db.insert(schema.clubGallery).values({
          clubId: antalyaClub.id,
          universityId: ege.id,
          uploadedBy: uploader!.id,
          imageUrl: "https://example.com/x.jpg",
        }),
      "club_gallery_club_tenant_fkey"
    );
  });

  it("kulüp kurma başvurusu, başvuranın kendi üniversitesi dışına açılamaz", async () => {
    const { antalya, egeUser } = await fixtures();

    await expectConstraintViolation(
      () =>
        db.insert(schema.clubApplications).values({
          universityId: antalya.id,
          applicantId: egeUser.id,
          proposedName: "Başka Okuldan Başvuru",
        }),
      "club_applications_applicant_tenant_fkey"
    );
  });
});
