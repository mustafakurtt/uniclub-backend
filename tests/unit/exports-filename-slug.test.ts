import { describe, it, expect } from "bun:test";
import { slugify } from "../../src/shared/utils/slug.util";

describe("export dosya adı parametre slug", () => {
  it("Türkçe karakterli parametre özeti → doğru slug", () => {
    expect(slugify("tüm kayıtlar")).toBe("tum-kayitlar");
  });

  it("durum ve tarih özeti", () => {
    expect(slugify("durum=approved, başlangıç=2026-01-01")).toBe(
      "durum-approved-baslangic-2026-01-01"
    );
  });
});
