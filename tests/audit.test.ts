/**
 * Denetim izi (audit trail) — `guard()` zincirindeki `auditTrail` hook'unun
 * gerçekten yazdığını sınar.
 *
 * NEDEN AYRI BİR DOSYA: bu davranış uzun süre HİÇ sınanmıyordu. Sink, istemci
 * IP'sini okurken `app.request()` altında (Bun sunucusu yok) patlıyor, hook da
 * hatayı bilinçli olarak yutuyordu — "bildirim gidemedi diye işlem geri alınmaz"
 * ilkesinin denetim karşılığı. Sonuç: testlerde tek bir denetim satırı bile
 * yazılmıyordu ve bunu kimse fark etmiyordu. `clientIp` artık sunucusuz ortamda
 * "unknown" dönüyor; bu testler o yolun açık kalmasını garanti eder.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { app, login, me } from "./helpers";
import { db } from "../src/db";
import { auditLogs } from "../src/db/schema";

const post = (path: string, token: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

/** Bu aktörün en yeni denetim kaydı. */
async function latestLogFor(actorId: string) {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.actorId, actorId))
    .orderBy(auditLogs.createdAt);
  return rows.at(-1);
}

describe("denetim izi", () => {
  let admin: string;
  let adminId: string;
  let student: string;
  let studentId: string;
  let uni: string;

  beforeAll(async () => {
    admin = await login("elif.demir@antalya.edu.tr"); // university_admin
    student = await login("mustafa.kurt@std.antalya.edu.tr"); // yetkisiz
    const adminMe = await me(admin);
    adminId = adminMe.userId;
    uni = adminMe.universityId as string;
    studentId = (await me(student)).userId;
  });

  it("başarılı bir mutasyon denetim izine düşer (aktör, aksiyon, yol, durum)", async () => {
    const res = await post(
      `/api/moderation/universities/${uni}/users/${studentId}/ban`,
      admin,
      { reason: "Denetim izi testi" }
    );
    expect(res.status).toBe(200);

    const log = await latestLogFor(adminId);
    expect(log).toBeTruthy();
    expect(log!.action).toBe("user.manage");
    expect(log!.method).toBe("POST");
    expect(log!.status).toBe(200);
    expect(log!.path).toContain(studentId);
    expect(log!.universityId).toBe(uni);

    // temizlik: kullanıcıyı geri aç (diğer testler bu hesabı kullanıyor)
    await post(`/api/moderation/universities/${uni}/users/${studentId}/unban`, admin, {});
  });

  it("REDDEDİLEN deneme de yazılır (403) — denetimin asıl kıymeti burada", async () => {
    const res = await post(
      `/api/moderation/universities/${uni}/users/${adminId}/ban`,
      student, // yetkisi yok
      { reason: "Yetkisiz deneme" }
    );
    expect(res.status).toBe(403);

    const log = await latestLogFor(studentId);
    expect(log).toBeTruthy();
    expect(log!.status).toBe(403);
    expect(log!.action).toBe("user.manage");
  });

  it("istemci IP'si sunucusuz ortamda kaydı düşürmez", async () => {
    // Asıl regresyon buydu: IP okunamadığında sink patlıyor ve satır hiç yazılmıyordu.
    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.actorId, adminId), eq(auditLogs.action, "user.manage")));
    expect(rows.length).toBeGreaterThan(0);
    // IP bilinmiyor olabilir ama kayıt VAR — eksik bilgi, kayıp kayıt değil.
    expect(rows.every((r) => r.ip !== null)).toBe(true);
  });
});
