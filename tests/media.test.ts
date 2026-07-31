import { describe, it, expect, beforeAll } from "bun:test";
import { app, login, get } from "./helpers";

/**
 * media (dosya yükleme) feature'ının uçtan uca davranışı: multipart upload →
 * URL → public serve (bayt eşitliği), magic-byte doğrulama (kılık değiştirmiş
 * dosya reddi), key doğrulama (traversal), sahiplik (silme), auth.
 * STORAGE_DRIVER=memory (tests/setup.ts) → diske yazmaz.
 */

// 1x1 saydam PNG (magic byte'lı gerçek görsel).
const PNG_BYTES = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0)
);

function uploadForm(bytes: Uint8Array, type: string, filename: string, purpose = "gallery") {
  const fd = new FormData();
  // View aralığını temiz ArrayBuffer'a kopyala (TS BlobPart Uint8Array view'ı doğrudan kabul etmiyor).
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  fd.append("file", new Blob([buf], { type }), filename);
  fd.append("purpose", purpose);
  return fd;
}

const upload = (token: string, fd: FormData) =>
  app.request("/api/uploads", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });

describe("Media (upload)", () => {
  let mustafa: string;
  let can: string;

  beforeAll(async () => {
    mustafa = await login("mustafa.kurt@std.antalya.edu.tr");
    can = await login("can.ozturk@std.antalya.edu.tr");
  });

  it("token yoksa upload → 401", async () => {
    const res = await app.request("/api/uploads", { method: "POST", body: uploadForm(PNG_BYTES, "image/png", "x.png") });
    expect(res.status).toBe(401);
  });

  it("gerçek PNG yüklenir (201) ve public URL bayt-bayt geri servis edilir", async () => {
    const res = await upload(mustafa, uploadForm(PNG_BYTES, "image/png", "x.png", "club_logo"));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(data.contentType).toBe("image/png");
    expect(data.sizeBytes).toBe(PNG_BYTES.length);

    // Public serve (auth'suz) — içerik-tipi + baytlar aynı
    const served = await app.request(data.url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    const back = new Uint8Array(await served.arrayBuffer());
    expect(back).toEqual(PNG_BYTES);
  });

  it("kılık değiştirmiş dosya (.png ama HTML içerik) → 400 (magic-byte reddi)", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const res = await upload(mustafa, uploadForm(html, "image/png", "evil.png"));
    expect(res.status).toBe(400);
  });

  it("geçersiz purpose → 400", async () => {
    const res = await upload(mustafa, uploadForm(PNG_BYTES, "image/png", "x.png", "hacker"));
    expect(res.status).toBe(400);
  });

  it("serve: geçersiz/traversal key → 400; olmayan key → 404", async () => {
    expect((await app.request("/uploads/not-a-valid-key")).status).toBe(400);
    // geçerli formatta ama var olmayan uuid
    expect((await app.request("/uploads/00000000-0000-4000-8000-000000000000.png")).status).toBe(404);
  });

  it("silme: yalnızca yükleyen; başkası → 403, yükleyen → 200", async () => {
    const { data } = await (await upload(mustafa, uploadForm(PNG_BYTES, "image/png", "x.png"))).json();
    const del = (token: string) =>
      app.request(`/api/uploads/${data.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });

    expect((await del(can)).status).toBe(403); // başkası silemez
    expect((await del(mustafa)).status).toBe(200); // yükleyen siler
    // silindikten sonra dosya artık servis edilmez
    expect((await get(data.url)).status).toBe(404);
  });
});
