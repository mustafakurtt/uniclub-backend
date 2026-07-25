import { describe, it, expect, beforeAll } from "bun:test";
import { data, get, login, me, reqAuth } from "./helpers";

/**
 * Denetim izinin (audit trail) UÇTAN UCA davranışı.
 *
 * Bu dosya gerçek bir boşluğu kapatıyor: kanca `core/rbac/audit-hook.ts`'te,
 * alan türetme `features/audit/audit.sink.ts`'te, okuma `/api/audit`'te — ama
 * hiçbir test kaydın GERÇEKTEN yazıldığını doğrulamıyordu. Nitekim `clientIp`,
 * `app.request()` bağlamında `getConnInfo`'nun fırlatması yüzünden sink'i
 * düşürüyordu: sink hataları bilinçli olarak yutulduğu için (denetim kaydı asıl
 * işlemin sonucunu değiştirmemeli) testler yeşil kalıyor, kayıt ise HİÇ
 * yazılmıyordu. Sessiz bozulmayı ancak böyle bir test yakalar.
 *
 * KAPSAM: denetim izi yalnızca `guard()` zincirinden geçen rotalarda üretilir
 * (admin, audit, auth, moderation). Kulüp/etkinlik rotaları kendi üyelik-rolü
 * kontrolünü kullandığı için denetlenmez — bu yüzden testler admin rotasına dayanır.
 */
interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  method: string;
  path: string;
  status: number;
  targetType: string | null;
  targetId: string | null;
  metadata: { params?: Record<string, string>; body?: Record<string, unknown> } | null;
  ip: string | null;
  createdAt: string;
}

describe("Denetim izi (audit trail)", () => {
  let elif: string; // university_admin (Antalya) — club.update + audit.view
  let mustafa: string; // öğrenci — admin rotasında YETKİSİZ
  let antalyaUni: string;
  let techClubId: string;

  /** Antalya'nın denetim akışı, en yeniden eskiye. */
  const auditLogs = async () =>
    (
      await data<{ items: AuditLog[] }>(
        await get(`/api/audit/universities/${antalyaUni}?limit=50`, elif)
      )
    ).items;

  const clubPath = () => `/api/admin/universities/${antalyaUni}/clubs/${techClubId}`;

  beforeAll(async () => {
    [elif, mustafa] = await Promise.all([
      login("elif.demir@antalya.edu.tr"),
      login("mustafa.kurt@std.antalya.edu.tr"),
    ]);

    antalyaUni = (await me(elif)).universityId as string;
    expect(antalyaUni).toBeTruthy();

    const clubs = await data<{ id: string; slug: string }[]>(await get("/api/clubs", mustafa));
    techClubId = clubs.find((c) => c.slug === "yazilim-teknoloji")!.id;
  });

  it("BAŞARILI mutasyon kaydedilir (aktör, yol, hedef, gövde, ip)", async () => {
    const marker = `denetim-testi-${crypto.randomUUID().slice(0, 8)}`;
    const res = await reqAuth("PATCH", clubPath(), elif, { description: marker });
    expect(res.status).toBe(200);

    const elifId = (await me(elif)).userId;
    const kayit = (await auditLogs()).find((log) => log.metadata?.body?.description === marker);

    expect(kayit).toBeDefined();
    expect(kayit!.actorId).toBe(elifId);
    expect(kayit!.action).toBe("club.update");
    expect(kayit!.method).toBe("PATCH");
    expect(kayit!.path).toBe(clubPath());
    expect(kayit!.status).toBe(200);
    expect(kayit!.targetType).toBe("club");
    expect(kayit!.targetId).toBe(techClubId);
    // `clientIp` fırlatırsa sink düşer ve kayıt HİÇ yazılmaz; dolu olması
    // app.request() bağlamında da IP çözümünün güvenli davrandığını gösterir.
    expect(kayit!.ip).toBeTruthy();
  });

  it("REDDEDİLEN deneme de (403) kaydedilir — denetim izinin asıl değeri", async () => {
    const marker = `yetkisiz-deneme-${crypto.randomUUID().slice(0, 8)}`;
    const res = await reqAuth("PATCH", clubPath(), mustafa, { description: marker });
    expect(res.status).toBe(403);

    const mustafaId = (await me(mustafa)).userId;
    const kayit = (await auditLogs()).find((log) => log.metadata?.body?.description === marker);

    expect(kayit).toBeDefined();
    expect(kayit!.actorId).toBe(mustafaId);
    expect(kayit!.status).toBe(403);
  });

  it("OKUMA istekleri (GET) kaydedilmez — gürültü", async () => {
    await get(`${clubPath()}/advisors`, elif); // guard(club.view) — okuma
    expect((await auditLogs()).filter((log) => log.method === "GET")).toEqual([]);
  });

  it("başka üniversitenin yöneticisi Antalya'nın kayıtlarını GÖREMEZ", async () => {
    const okan = await login("okan.yildiz@egebilim.edu.tr"); // Ege university_admin
    expect((await get(`/api/audit/universities/${antalyaUni}`, okan)).status).toBe(403);
  });
});
