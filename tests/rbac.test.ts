import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, me } from "./helpers";

// guard() zincirinin uçtan uca davranışı: kimlik yoksa 401, yetki yoksa 403,
// yetki varsa 200; ve tenant-scope — bir tenant yöneticisi BAŞKA bir
// üniversitenin kaynağına uzanamaz, super_admin ise scope'u bypass eder.
describe("RBAC guard — GET /api/admin/universities/:id/users (USER_VIEW, tenantScoped)", () => {
  let antalyaAdmin: string;
  let egeAdmin: string;
  let student: string;
  let superAdmin: string;
  let antalyaUni: string;
  let egeUni: string;

  beforeAll(async () => {
    antalyaAdmin = await login("elif.demir@antalya.edu.tr"); // university_admin (Antalya)
    egeAdmin = await login("okan.yildiz@egebilim.edu.tr"); // university_admin (Ege)
    student = await login("mustafa.kurt@std.antalya.edu.tr"); // student (yetkisiz)
    superAdmin = await login("superadmin@platform.local"); // super_admin (scope bypass)

    antalyaUni = (await me(antalyaAdmin)).universityId as string;
    egeUni = (await me(egeAdmin)).universityId as string;
    expect(antalyaUni).toBeTruthy();
    expect(egeUni).toBeTruthy();
    expect(antalyaUni).not.toBe(egeUni);
  });

  const usersOf = (uni: string) => `/api/admin/universities/${uni}/users`;

  it("token yoksa 401", async () => {
    expect((await get(usersOf(antalyaUni))).status).toBe(401);
  });

  it("öğrenci (user.view yok) → 403", async () => {
    expect((await get(usersOf(antalyaUni), student)).status).toBe(403);
  });

  it("kendi tenant'ının yöneticisi → 200", async () => {
    expect((await get(usersOf(antalyaUni), antalyaAdmin)).status).toBe(200);
  });

  it("başka bir tenant'a uzanan yönetici → 403 (tenant scope)", async () => {
    expect((await get(usersOf(egeUni), antalyaAdmin)).status).toBe(403);
  });

  it("super_admin tenant'lar arası → 200 (scope bypass)", async () => {
    expect((await get(usersOf(egeUni), superAdmin)).status).toBe(200);
  });
});
