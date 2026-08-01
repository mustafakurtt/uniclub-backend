/**
 * Kurumsal rapor dışa aktarma (T4.5 v1) — yetki, tenant izolasyonu, deterministik çıktı.
 */
import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import { login, me, reqAuth, data, get } from "./helpers";
import { db } from "../src/db";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exportPost(
  universityId: string,
  reportId: string,
  token: string,
  body: unknown = {}
) {
  return reqAuth("POST", `/api/universities/${universityId}/exports/${reportId}`, token, body);
}

describe("kurumsal rapor dışa aktarma (/api/universities/:id/exports)", () => {
  it("yetkisiz öğrenci → 403", async () => {
    const student = await login("burak.demirci@std.antalya.edu.tr");
    const uni = (await me(student)).universityId as string;
    const res = await exportPost(uni, "clubs", student, {});
    expect(res.status).toBe(403);
  });

  it("katalog listesi yetkili SKS için → 200", async () => {
    const sks = await login("sks@antalya.edu.tr");
    const uni = (await me(sks)).universityId as string;
    const res = await get(`/api/universities/${uni}/exports`, sks);
    expect(res.status).toBe(200);
    const catalog = await data<Array<{ id: string }>>(res);
    expect(catalog.map((r) => r.id)).toEqual(["clubs", "club-members", "activities"]);
  });

  it("aynı parametrelerle iki üretim → aynı SHA-256", async () => {
    const sks = await login("sks@antalya.edu.tr");
    const uni = (await me(sks)).universityId as string;
    const body = { status: "approved" };

    const res1 = await exportPost(uni, "clubs", sks, body);
    const res2 = await exportPost(uni, "clubs", sks, body);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const hash1 = sha256(new Uint8Array(await res1.arrayBuffer()));
    const hash2 = sha256(new Uint8Array(await res2.arrayBuffer()));
    expect(hash1).toBe(hash2);
  });

  it("boş sonuç → geçerli dosya (yalnızca başlık)", async () => {
    const sks = await login("sks@antalya.edu.tr");
    const uni = (await me(sks)).universityId as string;
    const farFuture = new Date("2099-01-01T00:00:00.000Z").toISOString();

    const res = await exportPost(uni, "clubs", sks, { createdFrom: farFuture });
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
  });

  it("başka tenant kulüp kimliği → 404", async () => {
    const sks = await login("sks@antalya.edu.tr");
    const antalyaUni = (await me(sks)).universityId as string;

    const egeClub = await db.query.clubs.findFirst({
      where: { slug: "robotik-mekatronik" },
      columns: { id: true },
    });
    expect(egeClub?.id).toBeTruthy();

    const res = await exportPost(antalyaUni, "club-members", sks, { clubId: egeClub!.id });
    expect(res.status).toBe(404);
  });

  it("club-members raporu üye satırları döner", async () => {
    const sks = await login("sks@antalya.edu.tr");
    const uni = (await me(sks)).universityId as string;
    const techClub = await db.query.clubs.findFirst({
      where: { slug: "yazilim-teknoloji", universityId: uni },
      columns: { id: true },
    });

    const res = await exportPost(uni, "club-members", sks, {
      clubId: techClub!.id,
      status: "approved",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
  });
});
