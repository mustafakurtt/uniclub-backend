import { describe, expect, it } from "bun:test";
import { createTranslator, mergeCatalogs } from "../../src/core/i18n/translator";
import { resolveLocale } from "../../src/core/i18n/locale";

/** core/i18n birim testleri — saf fonksiyonlar, altyapı gerektirmez. */

describe("resolveLocale", () => {
  const supported = ["tr", "en"];

  it("header yoksa fallback döner", () => {
    expect(resolveLocale(undefined, supported, "tr")).toBe("tr");
  });

  it("bölgesel etiketi kök dile indirger (tr-TR → tr)", () => {
    expect(resolveLocale("tr-TR", supported, "en")).toBe("tr");
  });

  it("q-değerine UYAR — sıraya değil (RFC 9110)", () => {
    // "en" önce yazılmış ama q'su düşük: doğru cevap "tr".
    expect(resolveLocale("en;q=0.8,tr;q=0.9", supported, "en")).toBe("tr");
  });

  it("q verilmeyen etiket 1.0 sayılır", () => {
    expect(resolveLocale("en;q=0.8,tr", supported, "en")).toBe("tr");
  });

  it("q=0 'kabul etme' demektir — o dil seçilmez", () => {
    expect(resolveLocale("tr;q=0,en;q=0.5", supported, "tr")).toBe("en");
  });

  it("desteklenmeyen dilleri atlar", () => {
    expect(resolveLocale("de,fr;q=0.9,en;q=0.1", supported, "tr")).toBe("en");
  });

  it("hiçbiri desteklenmiyorsa fallback", () => {
    expect(resolveLocale("de,fr", supported, "tr")).toBe("tr");
  });

  it("eşit q'da header sırası korunur (stabil sıralama)", () => {
    expect(resolveLocale("en;q=0.5,tr;q=0.5", supported, "tr")).toBe("en");
  });
});

describe("createTranslator", () => {
  const t = createTranslator(
    {
      tr: { "greet": "Merhaba {name}", "only.tr": "sadece tr" },
      en: { "greet": "Hello {name}", "only.tr": "tr only" },
    },
    "tr"
  );

  it("anahtarı isteğin diline çevirir", () => {
    expect(t("greet", "en", { name: "Ada" })).toBe("Hello Ada");
    expect(t("greet", "tr", { name: "Ada" })).toBe("Merhaba Ada");
  });

  it("bilinmeyen dilde varsayılan dile düşer", () => {
    expect(t("greet", "de", { name: "Ada" })).toBe("Merhaba Ada");
  });

  it("GERİ UYUM: katalogda olmayan anahtar AYNEN döner", () => {
    // Anahtara göç etmemiş düz Türkçe metin fırlatan feature'lar bozulmamalı.
    expect(t("Kulüp bulunamadı.", "tr")).toBe("Kulüp bulunamadı.");
  });

  it("eksik parametreyi yer tutucu olarak bırakır (sessizce 'undefined' yazmaz)", () => {
    expect(t("greet", "en", {})).toBe("Hello {name}");
  });

  it("parametre verilmezse şablonu olduğu gibi döner", () => {
    expect(t("greet", "en")).toBe("Hello {name}");
  });
});

describe("mergeCatalogs", () => {
  it("feature parçalarını tek kataloga birleştirir", () => {
    const merged = mergeCatalogs({ tr: { a: "A" } }, { tr: { b: "B" }, en: { b: "B-en" } });
    expect(merged).toEqual({ tr: { a: "A", b: "B" }, en: { b: "B-en" } });
  });

  it("aynı (dil, anahtar) iki parçada varsa FIRLATIR (sessizce üzerine yazmaz)", () => {
    expect(() => mergeCatalogs({ tr: { dup: "1" } }, { tr: { dup: "2" } })).toThrow(/çakışma/);
  });

  it("aynı anahtar FARKLI dillerdeyse çakışma değildir", () => {
    expect(() => mergeCatalogs({ tr: { k: "1" } }, { en: { k: "2" } })).not.toThrow();
  });
});
