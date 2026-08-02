/**
 * Kurul üyeliği tabanlı başvuru erişimi — academic_affairs vb. global application.view olmadan.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { login, me, reqAuth, get, data } from "./helpers";
import { db } from "../src/db";
import {
  restoreAntalyaSeedApprovalChain,
  restoreAntalyaSeedFormationThreshold,
  setTenantFormationThreshold,
} from "./tenant-test-helpers";

const patch = (path: string, token: string, body?: unknown) =>
  reqAuth("PATCH", path, token, body);

describe("kurul üyeliği tabanlı başvuru erişimi", () => {
  let uni: string;
  let adminToken: string;
  let academicAffairsToken: string;
  let auditorToken: string;
  let partialAppId: string;
  let voteAppId: string;
  let approvedAppId: string;

  beforeAll(async () => {
    adminToken = await login("sks@antalya.edu.tr");
    academicAffairsToken = await login("ogrenci.isleri@antalya.edu.tr");
    auditorToken = await login("denetci@antalya.edu.tr");
    uni = (await me(adminToken)).universityId as string;

    await setTenantFormationThreshold(uni, 0, (await me(adminToken)).userId as string);

    const partialApp = await db.query.clubApplications.findFirst({
      where: { universityId: uni, proposedName: "Robotik ve Otomasyon Kulübü", status: "pending" },
      columns: { id: true },
    });
    if (!partialApp) throw new Error("seed: Robotik başvurusu yok");
    partialAppId = partialApp.id;

    const voteApp = await db.query.clubApplications.findFirst({
      where: { universityId: uni, proposedName: "Kampüs Girişimcilik Kulübü", status: "pending" },
      columns: { id: true },
    });
    if (!voteApp) throw new Error("seed: Kampüs Girişimcilik başvurusu yok");
    voteAppId = voteApp.id;

    const approvedApp = await db.query.clubApplications.findFirst({
      where: { universityId: uni, proposedName: "Müzik Kulübü", status: "approved" },
      columns: { id: true },
    });
    if (!approvedApp) throw new Error("seed: Müzik başvurusu yok");
    approvedAppId = approvedApp.id;
  });

  afterAll(async () => {
    const actorId = (await me(adminToken)).userId as string;
    await restoreAntalyaSeedApprovalChain(uni, actorId);
    await restoreAntalyaSeedFormationThreshold(uni, actorId);
  });

  it("academic_affairs kurul üyesi → kurul kademesindeki başvuruyu görebilir", async () => {
    const res = await get(
      `/api/admin/universities/${uni}/club-applications/${partialAppId}`,
      academicAffairsToken
    );
    expect(res.status).toBe(200);
    const application = await data<{ proposedName: string; approvals: unknown[] }>(res);
    expect(application.proposedName).toBe("Robotik ve Otomasyon Kulübü");
    expect(application.approvals.length).toBeGreaterThan(0);
  });

  it("academic_affairs → kurul kademesinde olmayan (onaylı) başvuruya erişemez", async () => {
    const res = await get(
      `/api/admin/universities/${uni}/club-applications/${approvedAppId}`,
      academicAffairsToken
    );
    expect(res.status).toBe(403);
  });

  it("my-committee-pending → yalnızca oy bekleyen kurul başvuruları", async () => {
    const list = await data<
      Array<{ id: string; committeeName: string }>
    >(
      await get(`/api/admin/universities/${uni}/club-applications/my-committee-pending`, academicAffairsToken)
    );
    expect(list.some((a) => a.id === partialAppId)).toBe(true);
    expect(list.every((a) => a.committeeName === "Koordinasyon Kurulu")).toBe(true);
    expect(list.some((a) => a.id === approvedAppId)).toBe(false);
  });

  it("application.view var ama kurul üyesi değil → oy veremez", async () => {
    const res = await patch(
      `/api/admin/universities/${uni}/club-applications/${voteAppId}/committee-vote`,
      auditorToken,
      {
        vote: "reject",
        reason: "Kurul dışı oy testi — ret gerekçesi yeterli uzunlukta.",
      }
    );
    expect(res.status).toBe(403);
  });

  it("academic_affairs → kurul kademesindeki başvuruya oy verebilir", async () => {
    const res = await patch(
      `/api/admin/universities/${uni}/club-applications/${voteAppId}/committee-vote`,
      academicAffairsToken,
      {
        vote: "reject",
        reason: "Kurul erişim testi — ret gerekçesi yeterli uzunlukta.",
      }
    );
    expect(res.status).toBe(200);
  });

  it("çapraz tenant kurul başvuru listesi → 403", async () => {
    const egeAdmin = await login("sks@egebilim.edu.tr");
    const egeUni = (await me(egeAdmin)).universityId as string;
    expect(
      (await get(`/api/admin/universities/${egeUni}/club-applications/my-committee-pending`, academicAffairsToken))
        .status
    ).toBe(403);
  });

  it("çapraz tenant başvuru detayı → 403", async () => {
    const egeAdmin = await login("sks@egebilim.edu.tr");
    const egeUni = (await me(egeAdmin)).universityId as string;
    expect(
      (await get(`/api/admin/universities/${egeUni}/club-applications/${partialAppId}`, academicAffairsToken))
        .status
    ).toBe(403);
  });
});
