/**
 * Üyelik tarihçesi (Tier 1.3) ve ret gerekçesi (Tier 1.4).
 *
 * Kulüpten ayrılmak artık satırı SİLMİYOR, `leftAt` damgalıyor — "geçen dönem
 * kim üyeydi" sorusu kulübün okula verdiği faaliyet raporunun ham verisi.
 * Bunun bedeli, her okuma yolunun `leftAt IS NULL` filtresini uygulamak
 * zorunda olması; bu testler o filtrenin unutulmadığını garanti eder.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { app, login, me } from "./helpers";
import { db } from "../src/db";
import { clubMembers, clubApplicationApprovals } from "../src/db/schema";

const authed = (method: string) => (path: string, token: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const post = authed("POST");
const patch = authed("PATCH");
const del = authed("DELETE");
const getAuth = (path: string, token: string) =>
  app.request(path, { headers: { authorization: `Bearer ${token}` } });

describe("üyelik tarihçesi: ayrılma satırı silmez", () => {
  let student: string;
  let studentId: string;
  let clubId: string;

  beforeAll(async () => {
    // Ayşe seed'de aktif bir öğrenci ve Müzik Kulübü'nün (open policy) üyesi DEĞİL.
    student = await login("ayse.yilmaz@std.antalya.edu.tr");
    studentId = (await me(student)).userId;
    const club = await db.query.clubs.findFirst({ where: { slug: "muzik" } });
    clubId = club!.id;
  });

  it("katıl → ayrıl: satır kalır, leftAt damgalanır", async () => {
    expect((await post(`/api/clubs/${clubId}/join`, student)).status).toBe(201);

    const joined = await db.query.clubMembers.findFirst({
      where: { clubId, userId: studentId },
    });
    expect(joined).toBeTruthy();
    expect(joined!.leftAt).toBeNull();

    expect((await del(`/api/clubs/${clubId}/leave`, student)).status).toBe(200);

    const left = await db.query.clubMembers.findFirst({
      where: { clubId, userId: studentId },
    });
    // ASIL İDDİA: satır DURUYOR. Eskiden burada `undefined` olurdu.
    expect(left).toBeTruthy();
    expect(left!.leftAt).not.toBeNull();
  });

  it("ayrılan üye, üye listesinde görünmez", async () => {
    const res = await getAuth(`/api/clubs/${clubId}/members`, student);
    expect(res.status).toBe(200);
    const members = (await res.json()).data as { id: string }[];
    expect(members.some((m) => m.id === studentId)).toBe(false);
  });

  it("yeniden katılım aynı satırı diriltir (leftAt sıfırlanır, mükerrer satır olmaz)", async () => {
    expect((await post(`/api/clubs/${clubId}/join`, student)).status).toBe(201);

    const rows = await db
      .select()
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, studentId)));

    // Birincil anahtar (club_id, user_id) → tek satır; diriltilmiş olmalı.
    expect(rows.length).toBe(1);
    expect(rows[0].leftAt).toBeNull();

    // temizlik
    await del(`/api/clubs/${clubId}/leave`, student);
  });
});

describe("kulüp başvurusu reddi: gerekçe zorunlu", () => {
  let admin: string;
  let uni: string;
  let applicationId: string;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr"); // university_admin (Antalya)
    uni = (await me(admin)).universityId as string;
    const pending = await db.query.clubApplications.findFirst({
      where: { universityId: uni, status: "pending" },
    });
    if (!pending) throw new Error("seed'de bekleyen başvuru yok");
    applicationId = pending.id;
  });

  const rejectUrl = () =>
    `/api/admin/universities/${uni}/club-applications/${applicationId}/reject`;

  it("gerekçesiz ret 400 döner", async () => {
    expect((await patch(rejectUrl(), admin, {})).status).toBe(400);
  });

  it("çok kısa gerekçe 400 döner", async () => {
    expect((await patch(rejectUrl(), admin, { note: "olmaz" })).status).toBe(400);
  });

  it("gerekçeli ret kabul edilir ve gerekçe onay adımına yazılır", async () => {
    const note = "Aynı amaçla kurulmuş aktif bir kulüp zaten var.";
    expect((await patch(rejectUrl(), admin, { note })).status).toBe(200);

    const approval = await db
      .select()
      .from(clubApplicationApprovals)
      .where(eq(clubApplicationApprovals.applicationId, applicationId));

    expect(approval[0].status).toBe("rejected");
    expect(approval[0].note).toBe(note);
    // Kararı kimin verdiği de kayıtlı olmalı — gerekçe tek başına yetmez.
    expect(approval[0].approverId).toBeTruthy();
    expect(approval[0].reviewedAt).not.toBeNull();
  });
});
