import { describe, expect, it } from "bun:test";
import { generatePassword, hashPassword, verifyPassword } from "../../src/core/auth/password";

/**
 * `generatePassword` geçici şifre üretir (bkz. moderation.service: yönetici bir
 * hesabın şifresini sıfırlar). Sözleşmesi: İLK 4 KARAKTER sırasıyla büyük harf,
 * küçük harf, rakam ve sembol taşır — yaygın şifre politikalarının istediği
 * sınıflar. Bu garanti tutmazsa kullanıcı "şifre politikayı geçmedi" hatası alır.
 */
describe("generatePassword", () => {
  it("ilk 4 karakter GARANTİLİ olarak 4 sınıfı taşır", () => {
    // Sınıflar KONUM bazında doğrulanır: "şifrenin bir yerinde büyük harf var mı"
    // zayıf bir testtir — gövde zaten büyük harf üretebildiği için bozuk bir
    // prefix'i çoğu turda gözden kaçırırdı.
    // Alfabede karışan karakterler yok: I, O (büyük), l (küçük), 0, 1 (rakam).
    const CLASSES = [/^[A-HJ-NP-Z]$/, /^[a-km-z]$/, /^[2-9]$/, /^[!@#$%&*?]$/];

    // Garanti ihtimale bağlı olmamalı; 500 üretimin HEPSİ geçmeli. Eski sürüm
    // 26 harfli alfabe varsayıyordu (gerçekte 24 büyük + 25 küçük) ve 1. karakteri
    // ~%8, 2. karakteri ~%10 oranında YANLIŞ sınıftan üretiyordu.
    for (let i = 0; i < 500; i++) {
      const password = generatePassword(12);
      CLASSES.forEach((sinif, konum) => expect(password[konum]).toMatch(sinif));
    }
  });

  it("karışması kolay karakterleri (I O l 0 1) HİÇ üretmez", () => {
    // Geçici şifre çoğu zaman elle okunup yazılır; O/0 ve l/1 karışması destek yükü.
    for (let i = 0; i < 200; i++) {
      expect(generatePassword(20)).not.toMatch(/[IOl01]/);
    }
  });

  it("istenen uzunlukta üretir; 8'in altı 8'e yükseltilir", () => {
    expect(generatePassword(16)).toHaveLength(16);
    expect(generatePassword(12)).toHaveLength(12);
    // İlk 4 karakter sınıf garantisine ayrıldığı için daha kısası anlamsız.
    expect(generatePassword(4)).toHaveLength(8);
  });

  it("her çağrıda farklı şifre üretir", () => {
    const uretilenler = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(uretilenler.size).toBe(200);
  });

  it("üretilen şifre hash'lenip doğrulanabilir (uçtan uca)", async () => {
    const password = generatePassword();
    const hash = await hashPassword(password);

    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(`${password}x`, hash)).toBe(false);
  });
});

describe("verifyPasswordOrDummy", () => {
  it("hash null ise her zaman false döner", async () => {
    const { verifyPasswordOrDummy } = await import("../../src/core/auth/password");
    expect(await verifyPasswordOrDummy("any-password", null)).toBe(false);
    expect(await verifyPasswordOrDummy("any-password", undefined)).toBe(false);
  });

  it("geçerli hash ile verifyPassword ile aynı sonuç", async () => {
    const { verifyPasswordOrDummy } = await import("../../src/core/auth/password");
    const hash = await hashPassword("TimingTestPass1!");
    expect(await verifyPasswordOrDummy("TimingTestPass1!", hash)).toBe(true);
    expect(await verifyPasswordOrDummy("wrong", hash)).toBe(false);
  });
});
