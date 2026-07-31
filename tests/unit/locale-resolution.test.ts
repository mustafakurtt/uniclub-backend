import { describe, it, expect } from "bun:test";
import { resolveAppLocale, resolveLocaleFromHeader } from "../../src/shared/i18n/locale-resolution";

describe("resolveAppLocale", () => {
  const supported = ["tr", "en"] as const;
  const systemDefault = "tr";

  it("kullanıcı tercihi Accept-Language'ı ezer", () => {
    expect(
      resolveAppLocale({
        userPreferredLanguage: "en",
        acceptLanguage: "tr",
        tenantDefaultLocale: "tr",
        supported,
        systemDefault,
      })
    ).toBe("en");
  });

  it("Accept-Language tenant varsayılanını ezer (kullanıcı tercihi yok)", () => {
    expect(
      resolveAppLocale({
        acceptLanguage: "en",
        tenantDefaultLocale: "tr",
        supported,
        systemDefault,
      })
    ).toBe("en");
  });

  it("tenant varsayılanı sistem varsayılanını ezer (kullanıcı tercihi yok, başlık yok)", () => {
    expect(
      resolveAppLocale({
        tenantDefaultLocale: "en",
        supported,
        systemDefault,
        useAcceptLanguage: false,
      })
    ).toBe("en");
  });

  it("kullanıcı tercihi tenant varsayılanından önce gelir", () => {
    expect(
      resolveAppLocale({
        userPreferredLanguage: "tr",
        tenantDefaultLocale: "en",
        supported,
        systemDefault,
        useAcceptLanguage: false,
      })
    ).toBe("tr");
  });

  it("resolveLocaleFromHeader eşleşme yoksa null", () => {
    expect(resolveLocaleFromHeader("de", supported)).toBeNull();
  });
});
