import { afterAll, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryStorage, LocalDiskStorage, type StorageStore } from "../../src/core/storage";

const tmpRoot = join(tmpdir(), `uniclub-storage-${Date.now()}`);
afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

/**
 * Adaptörler Liskov-substitutable olmalı: AYNI sözleşme testi hem bellek hem
 * disk için koşar. Testler `STORAGE_DRIVER=memory` ile koşuyor (bkz. tests/setup.ts),
 * ama prod disk kullanır — bu yüzden disk adaptörü de burada doğrulanır.
 */
const adaptorler: Array<[string, () => StorageStore]> = [
  ["InMemoryStorage", () => new InMemoryStorage()],
  ["LocalDiskStorage", () => new LocalDiskStorage(join(tmpRoot, crypto.randomUUID()))],
];

for (const [ad, kur] of adaptorler) {
  describe(`StorageStore sözleşmesi — ${ad}`, () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    it("put → get turu bytes ve contentType'ı korur", async () => {
      const store = kur();
      await store.put("a.png", bytes, "image/png");
      const nesne = await store.get("a.png");

      expect(nesne?.contentType).toBe("image/png");
      expect(Array.from(nesne!.bytes)).toEqual([1, 2, 3, 4]);
    });

    it("olmayan anahtar null döner", async () => {
      expect(await kur().get("yok.png")).toBeNull();
    });

    it("delete siler; olmayanı silmek idempotent", async () => {
      const store = kur();
      await store.put("a.png", bytes, "image/png");
      await store.delete("a.png");

      expect(await store.get("a.png")).toBeNull();
      expect(store.delete("a.png")).resolves.toBeUndefined();
    });

    it("YOL BİLEŞENLİ anahtar çalışır (ara klasörler oluşturulur)", async () => {
      const store = kur();
      // Tarihe göre klasörleme yaygın bir ihtiyaç; disk adaptörü ara klasörleri
      // kendisi açmazsa burada ENOENT ile düşerdi.
      await store.put("2026/07/a.png", bytes, "image/png");

      expect(Array.from((await store.get("2026/07/a.png"))!.bytes)).toEqual([1, 2, 3, 4]);
      await store.delete("2026/07/a.png");
      expect(await store.get("2026/07/a.png")).toBeNull();
    });
  });
}

describe("LocalDiskStorage — yol güvenliği", () => {
  const bytes = new Uint8Array([1]);

  it("baseDir DIŞINA çıkan anahtar REDDEDİLİR", async () => {
    const store = new LocalDiskStorage(join(tmpRoot, crypto.randomUUID()));

    // İkinci savunma hattı: media.service rastgele uuid üretir, ama kullanıcı
    // girdisinin bir gün key'e sızdığı durumda depo kendini korumalı.
    expect(store.put("../kacak.png", bytes, "image/png")).rejects.toThrow(/güvensiz key/);
    expect(store.get("../../etc/passwd")).rejects.toThrow(/güvensiz key/);
    expect(store.delete("../kacak.png")).rejects.toThrow(/güvensiz key/);
  });

  it("baseDir ile aynı ÖNEKİ paylaşan kardeş dizin de reddedilir", async () => {
    const store = new LocalDiskStorage(join(tmpRoot, "uploads"));

    // "uploads-gizli", "uploads" ile başlar ama ALTINDA değildir — ayıraç
    // kontrolü olmasaydı düz bir startsWith buna izin verirdi.
    expect(store.put("../uploads-gizli/a.png", bytes, "image/png")).rejects.toThrow(
      /güvensiz key/
    );
  });
});
