/**
 * Onay kurulu yönetimi yetkisi — SKS günlük işi (T1.3 önkoşul düzeltmesi).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { login, me, get, reqAuth } from "./helpers";
import { db } from "../src/db";
import { antalyaUniversityId } from "./tenant-test-helpers";

const post = (path: string, token: string, body?: unknown) =>
  reqAuth("POST", path, token, body);
const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

describe("onay kurulu yetkisi (university.approval_committee.manage)", () => {
  let sks: string;
  let uniAdmin: string;
  let student: string;
  let egeAdmin: string;
  let antalyaUni: string;
  let committeeId: string;
  const suffix = Date.now();

  const committeesPath = (uni: string) =>
    `/api/admin/universities/${uni}/approval-committees`;

  beforeAll(async () => {
    sks = await login("sks@antalya.edu.tr");
    uniAdmin = await login("elif.demir@antalya.edu.tr");
    student = await login("burak.demirci@std.antalya.edu.tr");
    egeAdmin = await login("okan.yildiz@egebilim.edu.tr");
    antalyaUni = await antalyaUniversityId();

    const seedCommittee = await db.query.approvalCommittees.findFirst({
      where: { universityId: antalyaUni, name: "Koordinasyon Kurulu" },
    });
    if (!seedCommittee) throw new Error("seed: Koordinasyon Kurulu yok");
    committeeId = seedCommittee.id;
  });

  it("student_affairs kurul listesini görebilir", async () => {
    const res = await get(committeesPath(antalyaUni), sks);
    expect(res.status).toBe(200);
    const body = (await res.json()).data as Array<{ name: string }>;
    expect(body.some((c) => c.name === "Koordinasyon Kurulu")).toBe(true);
  });

  it("student_affairs kurul oluşturabilir", async () => {
    const moderator = await login("moderator@antalya.edu.tr");
    const res = await post(committeesPath(antalyaUni), sks, {
      name: `Test Kurul ${suffix}`,
      memberUserIds: [(await me(sks)).userId as string, (await me(moderator)).userId as string],
    });
    expect(res.status).toBe(201);
  });

  it("student_affairs kurul düzenleyebilir", async () => {
    const createRes = await post(committeesPath(antalyaUni), sks, {
      name: `Düzenleme Kurul ${suffix}`,
      memberUserIds: [(await me(sks)).userId as string],
    });
    expect(createRes.status).toBe(201);
    const createdId = (await createRes.json()).data.id as string;

    const res = await patch(`${committeesPath(antalyaUni)}/${createdId}`, sks, {
      name: `Düzenleme Kurul Güncel ${suffix}`,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.name).toBe(`Düzenleme Kurul Güncel ${suffix}`);
  });

  it("university_admin kurul oluşturabilir", async () => {
    const ahmetHoca = await login("ahmet.hoca@antalya.edu.tr");
    const res = await post(committeesPath(antalyaUni), uniAdmin, {
      name: `Admin Kurul ${suffix}`,
      memberUserIds: [(await me(uniAdmin)).userId as string, (await me(ahmetHoca)).userId as string],
    });
    expect(res.status).toBe(201);
  });

  it("yetkisiz öğrenci → 403", async () => {
    expect((await get(committeesPath(antalyaUni), student)).status).toBe(403);
    expect(
      (await post(committeesPath(antalyaUni), student, {
        name: "Öğrenci Kurul",
        memberUserIds: [(await me(student)).userId as string],
      })).status
    ).toBe(403);
  });

  it("çapraz tenant → 404", async () => {
    const egeUni = (await me(egeAdmin)).universityId as string;
    expect((await get(committeesPath(antalyaUni), egeAdmin)).status).toBe(403);
    expect(
      (await get(`${committeesPath(egeUni)}/${committeeId}`, egeAdmin)).status
    ).toBe(404);
    expect(
      (await patch(`${committeesPath(egeUni)}/${committeeId}`, egeAdmin, {
        name: "Çapraz tenant",
      })).status
    ).toBe(404);
  });
});
