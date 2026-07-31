import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, reqAuth, data } from "./helpers";

/**
 * university feature'ının CACHE SÖZLEŞMESİ — uçtan uca.
 *
 * Read-through cache'in kendisi birim testlerinde (tests/unit/cache-keyspace.test.ts)
 * kanıtlanır. BURADA kanıtlanan şey farklı: her yazma rotasının DOĞRU efekti ve
 * DOĞRU path parametresini bildirdiği. Yanlış bir efekt ya da yanlış yazılmış bir
 * parametre adı isteği DÜŞÜRMEZ (yalnızca loglanır) — yani yalnızca "yaz, sonra
 * oku, taze mi?" biçiminde bir test yakalayabilir.
 *
 * Her senaryo aynı kalıptadır: OKU (cache'i doldur) → YAZ → tekrar OKU (taze mi?).
 * İlk okuma olmadan test anlamsızdır; bayat cevap ancak dolu bir cache'ten gelir.
 */
describe("university cache invalidasyonu (rota → efekt)", () => {
  let superAdmin: string;
  let universityId: string;
  let facultyId: string;

  const slug = `cache-test-${Date.now()}`;

  beforeAll(async () => {
    superAdmin = await login("superadmin@platform.local");
  });

  it("üniversite oluşturma listeyi tazeler (universityCreated)", async () => {
    const before = await data<{ id: string }[]>(await get("/api/universities"));

    const res = await reqAuth("POST", "/api/universities", superAdmin, {
      name: "Cache Test Üniversitesi",
      slug,
      domains: [{ domain: `${slug}.edu.tr`, domainType: "student" }],
    });
    expect(res.status).toBe(201);
    universityId = (await data<{ university: { id: string } }>(res)).university.id;

    const after = await data<{ id: string }[]>(await get("/api/universities"));
    expect(after.length).toBe(before.length + 1);
    expect(after.some((u) => u.id === universityId)).toBe(true);
  });

  it("üniversite güncelleme hem listeyi hem kaydı tazeler (universityUpdated)", async () => {
    await get(`/api/universities/${universityId}`); // cache'i doldur

    const res = await reqAuth("PATCH", `/api/universities/${universityId}`, superAdmin, {
      name: "Cache Test Üniversitesi (yeni ad)",
    });
    expect(res.status).toBe(200);

    const detail = await data<{ name: string }>(await get(`/api/universities/${universityId}`));
    expect(detail.name).toBe("Cache Test Üniversitesi (yeni ad)");

    const list = await data<{ id: string; name: string }[]>(await get("/api/universities"));
    expect(list.find((u) => u.id === universityId)?.name).toBe(
      "Cache Test Üniversitesi (yeni ad)"
    );
  });

  it("domain ekleme üniversite kaydını tazeler (domainsChanged)", async () => {
    const before = await data<{ domains: unknown[] }>(await get(`/api/universities/${universityId}`));

    const res = await reqAuth("POST", `/api/universities/${universityId}/domains`, superAdmin, {
      domain: `staff.${slug}.edu.tr`,
      domainType: "staff",
    });
    expect(res.status).toBe(201);

    const after = await data<{ domains: unknown[] }>(await get(`/api/universities/${universityId}`));
    expect(after.domains.length).toBe(before.domains.length + 1);
  });

  it("fakülte oluşturma/güncelleme fakülte listesini tazeler (facultyChanged)", async () => {
    const faculties = `/api/universities/${universityId}/faculties`;
    await get(faculties); // cache'i doldur

    const created = await reqAuth("POST", faculties, superAdmin, { name: "Mühendislik" });
    expect(created.status).toBe(201);
    facultyId = (await data<{ id: string }>(created)).id;

    const afterCreate = await data<{ id: string; name: string }[]>(await get(faculties));
    expect(afterCreate.map((f) => f.name)).toContain("Mühendislik");

    const updated = await reqAuth("PATCH", `${faculties}/${facultyId}`, superAdmin, {
      name: "Mühendislik Fakültesi",
    });
    expect(updated.status).toBe(200);

    const afterUpdate = await data<{ name: string }[]>(await get(faculties));
    expect(afterUpdate.map((f) => f.name)).toContain("Mühendislik Fakültesi");
  });

  it("bölüm yazımları bölüm listesini tazeler (departmentChanged)", async () => {
    const departments = `/api/universities/${universityId}/faculties/${facultyId}/departments`;
    await get(departments); // cache'i doldur

    const created = await reqAuth("POST", departments, superAdmin, { name: "Bilgisayar" });
    expect(created.status).toBe(201);
    const departmentId = (await data<{ id: string }>(created)).id;

    expect(
      (await data<{ name: string }[]>(await get(departments))).map((d) => d.name)
    ).toContain("Bilgisayar");

    const removed = await reqAuth("DELETE", `${departments}/${departmentId}`, superAdmin);
    expect(removed.status).toBe(200);

    expect(
      (await data<{ id: string }[]>(await get(departments))).some((d) => d.id === departmentId)
    ).toBe(false);
  });

  it("fakülte silme hem fakülte hem bölüm listesini tazeler (facultyDeleted)", async () => {
    const faculties = `/api/universities/${universityId}/faculties`;
    const departments = `${faculties}/${facultyId}/departments`;

    // İki listeyi de cache'e al; silme İKİSİNİ birden düşürmeli.
    await get(faculties);
    await get(departments);

    const res = await reqAuth("DELETE", `${faculties}/${facultyId}`, superAdmin);
    expect(res.status).toBe(200);

    expect(
      (await data<{ id: string }[]>(await get(faculties))).some((f) => f.id === facultyId)
    ).toBe(false);
    // Fakülte gittiği için bölüm listesi artık 404 döner — bayat 200 DEĞİL.
    expect((await get(departments)).status).toBe(404);
  });

  it("üniversite silme liste + kayıt + fakülte listesini tazeler (universityDeleted)", async () => {
    await get("/api/universities");
    await get(`/api/universities/${universityId}`);

    const res = await reqAuth("DELETE", `/api/universities/${universityId}`, superAdmin);
    expect(res.status).toBe(200);

    const list = await data<{ id: string }[]>(await get("/api/universities"));
    expect(list.some((u) => u.id === universityId)).toBe(false);
    expect((await get(`/api/universities/${universityId}`)).status).toBe(404);
  });
});
