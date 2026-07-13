import { describe, it, expect, beforeAll } from "bun:test";
import { get, login, me } from "./helpers";

// Multi-tenancy: bir tenant yöneticisi yalnızca KENDİ üniversitesinin verisini
// görür. Seed'de her iki üniversitede de "yazilim-teknoloji" slug'lı bir kulüp
// var; yine de listelemeler karışmamalıdır.
describe("multi-tenant izolasyon", () => {
  let antalyaAdmin: string;
  let antalyaUni: string;

  beforeAll(async () => {
    antalyaAdmin = await login("elif.demir@antalya.edu.tr");
    antalyaUni = (await me(antalyaAdmin)).universityId as string;
  });

  it("tenant yöneticisinin kullanıcı listesi yalnızca kendi üniversitesini içerir", async () => {
    const res = await get(`/api/admin/universities/${antalyaUni}/users`, antalyaAdmin);
    expect(res.status).toBe(200);

    const payload = JSON.stringify((await res.json()).data);
    expect(payload).toContain("elif.demir@antalya.edu.tr"); // kendi tenant'ı
    expect(payload).not.toContain("okan.yildiz@egebilim.edu.tr"); // başka tenant sızmamalı
    expect(payload).not.toContain("cem.arslan@std.egebilim.edu.tr");
  });
});
